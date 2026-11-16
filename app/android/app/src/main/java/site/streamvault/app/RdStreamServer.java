package site.streamvault.app;

import android.app.ActivityManager;
import android.content.Context;
import android.util.Log;

import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegKitConfig;
import com.arthenica.ffmpegkit.FFmpegSession;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Premium playback through the phone instead of straight from Real-Debrid —
 * the Android side of src/lib/localStream.ts. It works like the Linux one
 * (app/electron/rdStream.cjs); see there for the measurements behind the
 * numbers.
 *
 * A server on 127.0.0.1 that
 *   - relays a Real-Debrid file (`/<token>/file`): range requests answered
 *     from memory, the film loaded minutes ahead over several connections,
 *     a connection that goes quiet replaced — where the web view on its own
 *     keeps ~10 s and stalls whenever Real-Debrid's server sits;
 *   - converts it (`/<token>/convert?t=<seconds>`): the Dolby/DTS audio to
 *     AAC with ffmpeg (FFmpegKit, in this process), the video copied as it
 *     is, as fragmented MP4 for the player's Media Source feed. No web view
 *     decodes Dolby audio; Real-Debrid's own conversion re-encodes the whole
 *     film, live and far away.
 *
 * Only Real-Debrid download links are relayed (and, in a debug build, the
 * emulator's view of the development machine), each behind a random token.
 */
final class RdStreamServer {

    private static final String TAG = "SvRdStream";
    private static final long MB = 1024L * 1024L;
    /** The unit the file is loaded, kept and handed to readers in. */
    private static final int CHUNK = (int) MB;
    private static final int RUN_CHUNKS = 16;
    private static final int WORKERS = 4;
    /** Until the film has this much loaded ahead, a single connection (the first frame gets the whole line). */
    private static final long SOLO_UNTIL = 16 * MB;
    private static final long BEHIND = 24 * MB;
    private static final double AHEAD_S = 240;
    private static final long AHEAD_MIN = 32 * MB;
    private static final int FIRST_BYTE_MS = 8000;
    /** No byte for this long: the connection is dropped and its stretch asked for again. */
    private static final int QUIET_MS = 5000;
    /** A reader waiting this long on a chunk whose connection hasn't sent a byte: that connection is replaced. */
    private static final long REPLACE_MS = 2500;
    private static final int MAX_URL_FAILURES = 3;
    /** Nobody has read from the relay for this long (the player moved on, or closed): it stops loading ahead. */
    private static final long IDLE_STOP_MS = 30_000;
    /** Refusals in a row (403, 404, ... — the link is dead) before readers are told the file can't be loaded. */
    private static final int MAX_REFUSALS = 6;
    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private static final Pattern FRAME_TB = Pattern.compile("#tb 0: (\\d+)/(\\d+)");
    private static final Pattern FRAME_PKT = Pattern.compile("(?m)^0,\\s*(-?\\d+),");
    private static final String CORS = "Access-Control-Allow-Origin: *\r\nAccess-Control-Expose-Headers: X-Start-Time\r\n";

    private final Context context;
    private final boolean allowTestHosts;
    private final long budget;
    private final AtomicLong used = new AtomicLong();
    private final Map<String, Entry> files = new ConcurrentHashMap<>();
    private final ExecutorService connections = Executors.newCachedThreadPool();
    private final ExecutorService loaders = Executors.newCachedThreadPool();
    private final SecureRandom random = new SecureRandom();
    private ServerSocket socket;
    private Boolean ffmpeg;

    RdStreamServer(Context context, boolean allowTestHosts) {
        this.context = context.getApplicationContext();
        this.allowTestHosts = allowTestHosts;
        ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        long memoryClassMb = am != null ? am.getMemoryClass() : 192;
        // The film is kept on the Java heap: at most a third of what this app may use, never over 160 MB.
        this.budget = Math.max(48, Math.min(160, memoryClassMb / 3)) * MB;
    }

    void start() throws IOException {
        socket = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
        Thread accept = new Thread(() -> {
            while (!socket.isClosed()) {
                try {
                    Socket client = socket.accept();
                    connections.execute(() -> handle(client));
                } catch (IOException ignored) {
                    // closed
                }
            }
        }, "sv-rd-server");
        accept.setDaemon(true);
        accept.start();
    }

    void stop() {
        for (String token : new ArrayList<>(files.keySet())) close(token);
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
            // already closed
        }
        connections.shutdownNow();
        loaders.shutdownNow();
    }

    /** Whether ffmpeg is there for this phone's processor (FFmpegKit ships ARM builds). */
    synchronized boolean canConvert() {
        if (ffmpeg == null) {
            try {
                Log.i(TAG, "ffmpeg " + FFmpegKitConfig.getVersion());
                ffmpeg = true;
            } catch (Throwable t) {
                Log.w(TAG, "No ffmpeg on this device — Dolby files play through Real-Debrid's conversion", t);
                ffmpeg = false;
            }
        }
        return ffmpeg;
    }

    boolean isAllowed(String url) {
        try {
            URI u = new URI(url);
            String host = u.getHost() == null ? "" : u.getHost();
            if ("https".equals(u.getScheme()) && host.endsWith(".download.real-debrid.com") && u.getPath().startsWith("/d/")) return true;
            // A debug build may be pointed at a stand-in server on the development machine.
            return allowTestHosts && "http".equals(u.getScheme()) && ("10.0.2.2".equals(host) || "127.0.0.1".equals(host));
        } catch (Exception e) {
            return false;
        }
    }

    /** Start relaying a file; its token. */
    String open(List<String> urls, long size, double duration, int audioIndex, String videoCodec) {
        List<String> allowed = new ArrayList<>();
        for (String u : urls) if (isAllowed(u)) allowed.add(u);
        if (allowed.isEmpty()) throw new IllegalArgumentException("Only Real-Debrid download links can be played through the app");
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        StringBuilder token = new StringBuilder();
        for (byte b : bytes) token.append(String.format(Locale.ROOT, "%02x", b));
        Entry entry = new Entry();
        entry.file = new RelayFile(allowed, size, duration);
        entry.audioIndex = Math.max(0, audioIndex);
        entry.videoCodec = videoCodec == null ? "" : videoCodec.toLowerCase(Locale.ROOT);
        files.put(token.toString(), entry);
        return token.toString();
    }

    void close(String token) {
        Entry entry = files.remove(token);
        if (entry == null) return;
        FFmpegSession session = entry.converter;
        if (session != null) FFmpegKit.cancel(session.getSessionId());
        entry.file.close();
    }

    String fileUrl(String token) {
        return "http://127.0.0.1:" + socket.getLocalPort() + "/" + token + "/file";
    }

    String convertUrl(String token) {
        return "http://127.0.0.1:" + socket.getLocalPort() + "/" + token + "/convert";
    }

    // ── HTTP ──────────────────────────────────────────────────────────────

    private void handle(Socket client) {
        try (Socket s = client) {
            s.setSoTimeout(120_000);
            s.setTcpNoDelay(true);
            InputStream rawIn = s.getInputStream();
            BufferedReader in = new BufferedReader(new InputStreamReader(rawIn, StandardCharsets.ISO_8859_1));
            String requestLine = in.readLine();
            if (requestLine == null) return;
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            String method = parts[0];
            Map<String, String> headers = new HashMap<>();
            for (String line; (line = in.readLine()) != null && !line.isEmpty(); ) {
                int colon = line.indexOf(':');
                if (colon > 0) headers.put(line.substring(0, colon).trim().toLowerCase(Locale.ROOT), line.substring(colon + 1).trim());
            }
            OutputStream out = s.getOutputStream();
            if ("OPTIONS".equals(method)) {
                writeHead(out, "204 No Content", "Access-Control-Allow-Methods: GET, HEAD\r\nAccess-Control-Allow-Headers: *\r\nContent-Length: 0\r\n");
                return;
            }
            String target = parts[1];
            int q = target.indexOf('?');
            String path = q >= 0 ? target.substring(0, q) : target;
            String query = q >= 0 ? target.substring(q + 1) : "";
            String[] segments = path.split("/");
            Entry entry = segments.length >= 3 ? files.get(segments[1]) : null;
            if (entry == null || !("GET".equals(method) || "HEAD".equals(method))) {
                writeHead(out, "404 Not Found", "Content-Length: 0\r\n");
                return;
            }
            if ("file".equals(segments[2])) entry.file.serve(out, headers.get("range"), "HEAD".equals(method));
            else if ("convert".equals(segments[2])) convert(entry, segments[1], out, query);
            else writeHead(out, "404 Not Found", "Content-Length: 0\r\n");
        } catch (IOException ignored) {
            // the player moved on (a seek, the film closed) — normal
        }
    }

    private static void writeHead(OutputStream out, String status, String extra) throws IOException {
        String head = "HTTP/1.1 " + status + "\r\n" + CORS + "Cache-Control: no-store\r\nConnection: close\r\n" + extra + "\r\n";
        out.write(head.getBytes(StandardCharsets.ISO_8859_1));
        out.flush();
    }

    // ── Converting ────────────────────────────────────────────────────────

    /**
     * The file with its audio as AAC and the video copied, from `t` seconds
     * in (at the keyframe at or before it, both tracks there). ffmpeg numbers
     * the output from 0; the keyframe's own time — from a second, one-packet
     * output to a small file — goes ahead of the stream as X-Start-Time.
     */
    private void convert(Entry entry, String token, OutputStream out, String query) throws IOException {
        if (!canConvert()) {
            writeHead(out, "501 Not Implemented", "Content-Length: 0\r\n");
            return;
        }
        long at = 0;
        Matcher m = Pattern.compile("(?:^|&)t=(\\d+)").matcher(query);
        if (m.find()) at = Long.parseLong(m.group(1));
        FFmpegSession previous = entry.converter;
        if (previous != null) FFmpegKit.cancel(previous.getSessionId());

        String fifo = FFmpegKitConfig.registerNewFFmpegPipe(context);
        File startFile = File.createTempFile("sv-start", ".txt", context.getCacheDir());
        AtomicBoolean fifoOpened = new AtomicBoolean(false);
        List<String> args = new ArrayList<>();
        java.util.Collections.addAll(args, "-nostdin", "-hide_banner", "-loglevel", "error");
        if (at > 0) java.util.Collections.addAll(args, "-ss", String.valueOf(at), "-noaccurate_seek");
        java.util.Collections.addAll(args, "-i", "http://127.0.0.1:" + socket.getLocalPort() + "/" + token + "/file");
        // Where it starts: the first video packet's own timestamp (opened first: a plain file never blocks)
        java.util.Collections.addAll(args, "-map", "0:v:0", "-c", "copy", "-copyts", "-frames:v", "1", "-flush_packets", "1", "-f", "framecrc", "-y", startFile.getAbsolutePath());
        // The stream
        java.util.Collections.addAll(args, "-map", "0:v:0", "-map", "0:a:" + entry.audioIndex + "?", "-c:v", "copy");
        if (entry.videoCodec.equals("hevc") || entry.videoCodec.equals("h265")) java.util.Collections.addAll(args, "-tag:v", "hvc1");
        java.util.Collections.addAll(args, "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-sn", "-dn",
                "-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "2000000", "-y", fifo);

        FFmpegSession session = FFmpegKit.executeWithArgumentsAsync(args.toArray(new String[0]), done -> {
            // ffmpeg ended before opening the stream (bad input): let the reader below see the end.
            if (!fifoOpened.get()) unblock(fifo);
        });
        entry.converter = session;
        try (FileInputStream stream = new FileInputStream(fifo)) {
            fifoOpened.set(true);
            Double startTime = readStart(startFile, session, 30_000);
            if (startTime == null) {
                writeHead(out, "502 Bad Gateway", "Content-Length: 0\r\n");
                return;
            }
            writeHead(out, "200 OK", "Content-Type: video/mp4\r\nX-Start-Time: " + startTime + "\r\n");
            byte[] buf = new byte[128 * 1024];
            for (int n; (n = stream.read(buf)) > 0; ) out.write(buf, 0, n);
            out.flush();
        } finally {
            FFmpegKit.cancel(session.getSessionId());
            if (entry.converter == session) entry.converter = null;
            FFmpegKitConfig.closeFFmpegPipe(fifo);
            //noinspection ResultOfMethodCallIgnored
            startFile.delete();
        }
    }

    /** The keyframe the stream starts at, in seconds, once ffmpeg has written it (null: it didn't). */
    private static Double readStart(File file, FFmpegSession session, long timeoutMs) throws IOException {
        long until = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < until) {
            String text = readSmallFile(file);
            Matcher tb = FRAME_TB.matcher(text);
            Matcher pkt = FRAME_PKT.matcher(text);
            if (tb.find() && pkt.find()) {
                return Double.parseDouble(pkt.group(1)) * Double.parseDouble(tb.group(1)) / Double.parseDouble(tb.group(2));
            }
            if (session.getState() == com.arthenica.ffmpegkit.SessionState.COMPLETED || session.getState() == com.arthenica.ffmpegkit.SessionState.FAILED) {
                if (text.isEmpty()) return null;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
        return null;
    }

    private static String readSmallFile(File file) throws IOException {
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[8192];
            int n = in.read(buf);
            return n > 0 ? new String(buf, 0, n, StandardCharsets.UTF_8) : "";
        }
    }

    /** Open a named pipe's writing end and close it at once: a reader waiting to open it sees the end. */
    private void unblock(String fifo) {
        connections.execute(() -> {
            try (FileOutputStream ignored = new FileOutputStream(fifo)) {
                // opened and closed
            } catch (IOException ignored) {
                // gone already
            }
        });
    }

    // ── The relay ─────────────────────────────────────────────────────────

    private static final class Entry {
        RelayFile file;
        int audioIndex;
        String videoCodec;
        volatile FFmpegSession converter;
    }

    private static long retryDelay(int failures) {
        return Math.min(4000L, 250L << Math.min(Math.max(failures - 1, 0), 4));
    }

    private final class RelayFile {
        private final List<String> urls;
        private int urlIndex;
        private int urlFailures;
        private int failures;
        private int refusals;
        private long retryAt;
        private long size;
        private final double duration;
        private final HashMap<Integer, byte[]> chunks = new HashMap<>();
        private final HashMap<Integer, Run> claimed = new HashMap<>();
        private final HashSet<Run> runs = new HashSet<>();
        private final HashSet<Reader> readers = new HashSet<>();
        /** chunk -> [readers waiting on it, since when] */
        private final HashMap<Integer, long[]> waiting = new HashMap<>();
        private long lastPrimaryPos;
        private long lastReaderAt = System.currentTimeMillis();
        private boolean closed;
        private IOException broken;

        RelayFile(List<String> urls, long size, double duration) {
            this.urls = urls;
            this.size = Math.max(0, size);
            this.duration = Math.max(0, duration);
        }

        private int chunkCount() {
            return (int) ((size + CHUNK - 1) / CHUNK);
        }

        private int chunkLength(int i) {
            return (int) Math.min(CHUNK, size - (long) i * CHUNK);
        }

        private long aheadBytes() {
            long max = budget - BEHIND - 16 * MB;
            long wanted = size > 0 && duration > 0 ? (long) (size / duration * AHEAD_S) : AHEAD_MIN;
            return Math.min(max, Math.max(AHEAD_MIN, wanted));
        }

        private synchronized String url() {
            return urls.get(Math.min(urlIndex, urls.size() - 1));
        }

        /** Learn the file's size from Real-Debrid when the player didn't know it. */
        private void ensureSize() throws IOException {
            synchronized (this) {
                if (size > 0) return;
            }
            HttpURLConnection conn = (HttpURLConnection) new URL(url()).openConnection();
            try {
                conn.setConnectTimeout(FIRST_BYTE_MS);
                conn.setReadTimeout(FIRST_BYTE_MS * 2);
                conn.setRequestProperty("Range", "bytes=0-");
                conn.setRequestProperty("Accept-Encoding", "identity");
                conn.getResponseCode();
                String range = conn.getHeaderField("Content-Range");
                long total = 0;
                if (range != null && range.lastIndexOf('/') >= 0) total = Long.parseLong(range.substring(range.lastIndexOf('/') + 1).trim());
                if (total <= 0) total = conn.getContentLengthLong();
                if (total <= 0) throw new IOException("Real-Debrid did not say how big the file is");
                synchronized (this) {
                    size = total;
                }
            } finally {
                conn.disconnect();
            }
        }

        private Reader primary() {
            Reader best = null;
            for (Reader r : readers) if (best == null || r.delivered > best.delivered) best = r;
            return best;
        }

        private long contiguousAhead(long pos) {
            int i = (int) (pos / CHUNK);
            long bytes = 0;
            while (i < chunkCount() && chunks.containsKey(i)) bytes += chunkLength(i++);
            return Math.max(0, bytes - pos % CHUNK);
        }

        private Run carrierOf(int i) {
            Run owner = claimed.get(i);
            return owner != null && runs.contains(owner) ? owner : null;
        }

        private void preempt(Run run) {
            run.preempted = true;
            HttpURLConnection conn = run.conn;
            if (conn != null) loaders.execute(conn::disconnect);
        }

        /** Same rules as rdStream.cjs: waited-on chunks first, one connection until there's a cushion, stale prefetches dropped. */
        private void schedule() {
            if (closed || broken != null || size <= 0) return;
            if (System.currentTimeMillis() < retryAt) return;
            Reader primary = primary();
            if (primary != null) lastPrimaryPos = primary.pos;
            long pos = lastPrimaryPos;
            int from = (int) (pos / CHUNK);
            int to = (int) Math.min(chunkCount() - 1, (pos + aheadBytes()) / CHUNK);

            for (Run run : new ArrayList<>(runs)) {
                if (!run.urgent && !run.preempted && (run.next < from - 1 || run.next > to + RUN_CHUNKS)) preempt(run);
            }

            List<Integer> waited = new ArrayList<>(waiting.keySet());
            java.util.Collections.sort(waited);
            for (int i : waited) {
                if (chunks.containsKey(i)) continue;
                Run carrier = carrierOf(i);
                if (carrier != null && !carrier.preempted && i - carrier.next <= 1) continue;
                if (carrier != null && carrier.urgent && !carrier.preempted) continue;
                if (carrier != null) preempt(carrier);
                int urgentNow = 0;
                for (Run r : runs) if (r.urgent && !r.preempted) urgentNow++;
                if (urgentNow >= 3) break;
                startRun(i, true);
            }

            if (readers.isEmpty() && System.currentTimeMillis() - lastReaderAt > IDLE_STOP_MS) return;
            long cushion = contiguousAhead(pos);
            int live = 0;
            int urgentNow = 0;
            for (Run r : runs) {
                if (r.preempted) continue;
                if (r.urgent) urgentNow++;
                else live++;
            }
            int allowed = cushion < SOLO_UNTIL ? Math.max(0, 1 - urgentNow) : cushion < 64 * MB ? 2 : WORKERS;
            for (int i = from; i <= to && live < allowed; i++) {
                if (chunks.containsKey(i) || carrierOf(i) != null) continue;
                if (used.get() + (long) CHUNK * RUN_CHUNKS > budget) {
                    evict();
                    if (used.get() + (long) CHUNK * RUN_CHUNKS > budget * 11 / 10) break;
                }
                startRun(i, false);
                live++;
            }
        }

        private void startRun(int first, boolean urgent) {
            Run run = new Run();
            run.urgent = urgent;
            run.next = first;
            run.startedAt = System.currentTimeMillis();
            for (int i = first; i < chunkCount() && run.indices.size() < RUN_CHUNKS; i++) {
                if (i != first && (chunks.containsKey(i) || carrierOf(i) != null)) break;
                run.indices.add(i);
            }
            for (int i : run.indices) claimed.put(i, run);
            runs.add(run);
            loaders.execute(() -> load(run));
        }

        private void load(Run run) {
            boolean ok = false;
            boolean refused = false;
            String error = null;
            HttpURLConnection conn = null;
            try {
                long start = (long) run.indices.get(0) * CHUNK;
                long end = Math.min(size, (long) (run.indices.get(run.indices.size() - 1) + 1) * CHUNK);
                conn = (HttpURLConnection) new URL(url()).openConnection();
                run.conn = conn;
                if (run.preempted) return;
                conn.setConnectTimeout(FIRST_BYTE_MS);
                conn.setReadTimeout(QUIET_MS);
                // Real-Debrid sends to the end of the file whatever the range says; reading stops at `end`.
                conn.setRequestProperty("Range", "bytes=" + start + "-" + (end - 1));
                conn.setRequestProperty("Accept-Encoding", "identity");
                int code = conn.getResponseCode();
                if (code != 206 && !(code == 200 && start == 0)) {
                    refused = code >= 400 && code < 500 && code != 429;
                    throw new IOException("Real-Debrid answered " + code);
                }
                InputStream in = conn.getInputStream();
                int index = run.indices.get(0);
                byte[] buf = new byte[chunkLength(index)];
                int filled = 0;
                long pos = start;
                while (pos < end && !run.preempted && !closed) {
                    int n = in.read(buf, filled, (int) Math.min(buf.length - filled, end - pos));
                    if (n < 0) throw new IOException("Real-Debrid closed the connection early");
                    run.gotBytes = true;
                    filled += n;
                    pos += n;
                    if (filled == buf.length) {
                        store(index, buf);
                        index++;
                        run.next = index;
                        if (pos < end) {
                            buf = new byte[chunkLength(index)];
                            filled = 0;
                        }
                    }
                }
                ok = !run.preempted;
            } catch (IOException e) {
                error = e.getMessage();
            } finally {
                if (conn != null) conn.disconnect();
                finish(run, ok, refused, error);
            }
        }

        private synchronized void store(int index, byte[] buf) {
            if (!chunks.containsKey(index)) {
                chunks.put(index, buf);
                used.addAndGet(buf.length);
            }
            notifyAll();
        }

        private synchronized void finish(Run run, boolean ok, boolean refused, String error) {
            runs.remove(run);
            for (int i : run.indices) if (claimed.get(i) == run) claimed.remove(i);
            if (ok) {
                failures = 0;
                refusals = 0;
                urlFailures = 0;
            } else if (!run.preempted && !closed) {
                failures++;
                urlFailures++;
                if (refused) refusals++;
                retryAt = System.currentTimeMillis() + retryDelay(failures);
                Log.w(TAG, "Relay: " + error + " (chunk " + run.next + ", failure " + failures + ")");
                if (urlFailures >= MAX_URL_FAILURES && urlIndex < urls.size() - 1) {
                    urlIndex++;
                    urlFailures = 0;
                }
                if (refusals >= MAX_REFUSALS) broken = new IOException("Real-Debrid refuses to send this file");
            }
            evict();
            schedule();
            notifyAll();
        }

        /** Over budget: what's furthest behind the film goes first, then what's furthest beyond what it needs. */
        private void evict() {
            if (used.get() <= budget) return;
            long pos = lastPrimaryPos;
            int keepFrom = (int) (Math.max(0, pos - BEHIND) / CHUNK);
            int keepTo = (int) ((pos + aheadBytes()) / CHUNK);
            HashSet<Integer> busy = new HashSet<>();
            for (Reader r : readers) busy.add((int) (r.pos / CHUNK));
            List<Integer> order = new ArrayList<>(chunks.keySet());
            order.removeAll(busy);
            order.sort((a, b) -> Long.compare(rank(b, keepFrom, keepTo), rank(a, keepFrom, keepTo)));
            for (int i : order) {
                if (used.get() <= budget) break;
                if (rank(i, keepFrom, keepTo) < 1_000_000_000L && used.get() <= budget * 11 / 10) break;
                byte[] gone = chunks.remove(i);
                if (gone != null) used.addAndGet(-gone.length);
            }
        }

        private long rank(int i, int keepFrom, int keepTo) {
            if (i < keepFrom) return 2_000_000_000L + (keepFrom - i);
            if (i > keepTo) return 1_000_000_000L + (i - keepTo);
            return i - keepFrom;
        }

        /** A waiting reader's connection that hasn't sent a byte in REPLACE_MS: replace it. */
        private void replaceSlow() {
            long now = System.currentTimeMillis();
            for (Map.Entry<Integer, long[]> w : waiting.entrySet()) {
                if (now - w.getValue()[1] < REPLACE_MS) continue;
                Run carrier = carrierOf(w.getKey());
                if (carrier == null || carrier.gotBytes || carrier.preempted || now - carrier.startedAt < REPLACE_MS) continue;
                preempt(carrier);
                startRun(w.getKey(), true);
            }
        }

        /** A complete chunk, waiting for it to load when needed. */
        private synchronized byte[] get(int index) throws IOException {
            long[] w = waiting.get(index);
            if (w == null) waiting.put(index, w = new long[] {0, System.currentTimeMillis()});
            w[0]++;
            try {
                while (true) {
                    if (broken != null) throw broken;
                    if (closed) throw new IOException("closed");
                    byte[] have = chunks.get(index);
                    if (have != null) return have;
                    schedule();
                    replaceSlow();
                    try {
                        wait(250);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new IOException("interrupted");
                    }
                }
            } finally {
                if (--w[0] <= 0) waiting.remove(index);
            }
        }

        void serve(OutputStream out, String range, boolean head) throws IOException {
            try {
                ensureSize();
            } catch (IOException e) {
                writeHead(out, "502 Bad Gateway", "Content-Length: 0\r\n");
                return;
            }
            long start = 0;
            long end = size - 1;
            boolean partial = false;
            if (range != null) {
                Matcher m = RANGE.matcher(range);
                if (m.find()) {
                    partial = true;
                    if (!m.group(1).isEmpty()) start = Long.parseLong(m.group(1));
                    if (!m.group(2).isEmpty()) end = Math.min(Long.parseLong(m.group(2)), size - 1);
                    if (m.group(1).isEmpty() && !m.group(2).isEmpty()) {
                        start = Math.max(0, size - Long.parseLong(m.group(2)));
                        end = size - 1;
                    }
                }
            }
            if (start >= size || start > end) {
                writeHead(out, "416 Range Not Satisfiable", "Content-Range: bytes */" + size + "\r\nContent-Length: 0\r\n");
                return;
            }
            String extra = "Content-Type: application/octet-stream\r\nAccept-Ranges: bytes\r\nContent-Length: " + (end - start + 1) + "\r\n"
                    + (partial ? "Content-Range: bytes " + start + "-" + end + "/" + size + "\r\n" : "");
            writeHead(out, partial ? "206 Partial Content" : "200 OK", extra);
            if (head) return;
            Reader reader = new Reader();
            reader.pos = start;
            synchronized (this) {
                readers.add(reader);
            }
            try {
                long pos = start;
                while (pos <= end) {
                    int index = (int) (pos / CHUNK);
                    synchronized (this) {
                        reader.pos = pos;
                    }
                    byte[] buf = get(index);
                    int from = (int) (pos - (long) index * CHUNK);
                    int to = (int) Math.min(buf.length, end - (long) index * CHUNK + 1);
                    out.write(buf, from, to - from);
                    pos += to - from;
                    synchronized (this) {
                        reader.pos = pos;
                        reader.delivered += to - from;
                        schedule();
                    }
                }
                out.flush();
            } finally {
                synchronized (this) {
                    readers.remove(reader);
                    lastReaderAt = System.currentTimeMillis();
                }
            }
        }

        synchronized void close() {
            closed = true;
            for (Run run : new ArrayList<>(runs)) preempt(run);
            for (byte[] buf : chunks.values()) used.addAndGet(-buf.length);
            chunks.clear();
            notifyAll();
        }
    }

    private static final class Run {
        final List<Integer> indices = new ArrayList<>();
        volatile int next;
        volatile boolean gotBytes;
        volatile boolean preempted;
        volatile HttpURLConnection conn;
        boolean urgent;
        long startedAt;
    }

    private static final class Reader {
        long pos;
        long delivered;
    }
}
