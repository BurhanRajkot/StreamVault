package site.streamvault.app;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A tiny HTTP server on 127.0.0.1 that plays downloaded files back to the
 * web view with proper range requests, so an offline film can be scrubbed.
 * (Capacitor's own file URLs answer every range from the start of the file.)
 *
 * Only files registered with urlFor() are served, each behind a random token.
 */
final class LocalFileServer {

    private static final Pattern RANGE = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private final Map<String, File> files = new ConcurrentHashMap<>();
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final SecureRandom random = new SecureRandom();
    private ServerSocket socket;

    void start() throws IOException {
        socket = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        Thread accept = new Thread(() -> {
            while (!socket.isClosed()) {
                try {
                    Socket client = socket.accept();
                    pool.execute(() -> handle(client));
                } catch (IOException ignored) {
                    // closed, or a client gave up
                }
            }
        }, "sv-file-server");
        accept.setDaemon(true);
        accept.start();
    }

    void stop() {
        try {
            if (socket != null) socket.close();
        } catch (IOException ignored) {
            // already closed
        }
        pool.shutdownNow();
    }

    String urlFor(File file) {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        StringBuilder token = new StringBuilder();
        for (byte b : bytes) token.append(String.format(Locale.ROOT, "%02x", b));
        files.put(token.toString(), file);
        String name;
        try {
            name = URLEncoder.encode(file.getName(), "UTF-8").replace("+", "%20");
        } catch (IOException e) {
            name = "video";
        }
        return "http://127.0.0.1:" + socket.getLocalPort() + "/" + token + "/" + name;
    }

    private static String mimeOf(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".mkv")) return "video/x-matroska";
        if (lower.endsWith(".avi")) return "video/x-msvideo";
        return "application/octet-stream";
    }

    private void handle(Socket client) {
        try (Socket s = client) {
            s.setSoTimeout(30_000);
            BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.ISO_8859_1));
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

            String[] segments = parts[1].split("/");
            File file = segments.length >= 2 ? files.get(segments[1]) : null;
            if (file == null || !file.isFile() || !("GET".equals(method) || "HEAD".equals(method))) {
                out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                return;
            }

            long size = file.length();
            long start = 0;
            long end = size - 1;
            boolean partial = false;
            String range = headers.get("range");
            if (range != null) {
                Matcher m = RANGE.matcher(range);
                if (m.find()) {
                    partial = true;
                    if (!m.group(1).isEmpty()) start = Long.parseLong(m.group(1));
                    if (!m.group(2).isEmpty()) end = Math.min(Long.parseLong(m.group(2)), size - 1);
                    if (m.group(1).isEmpty() && !m.group(2).isEmpty()) {
                        // suffix range: the last N bytes
                        start = Math.max(0, size - Long.parseLong(m.group(2)));
                        end = size - 1;
                    }
                }
            }
            if (start >= size || start > end) {
                String head = "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + size + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                out.write(head.getBytes(StandardCharsets.ISO_8859_1));
                return;
            }
            long length = end - start + 1;
            StringBuilder head = new StringBuilder();
            head.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
            head.append("Content-Type: ").append(mimeOf(file.getName())).append("\r\n");
            head.append("Content-Length: ").append(length).append("\r\n");
            head.append("Accept-Ranges: bytes\r\n");
            if (partial) head.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(size).append("\r\n");
            head.append("Access-Control-Allow-Origin: *\r\n");
            head.append("Cache-Control: no-store\r\n");
            head.append("Connection: close\r\n\r\n");
            out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
            if ("HEAD".equals(method)) return;

            try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
                raf.seek(start);
                byte[] buffer = new byte[256 * 1024];
                long remaining = length;
                while (remaining > 0) {
                    int read = raf.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                    if (read < 0) break;
                    out.write(buffer, 0, read);
                    remaining -= read;
                }
                out.flush();
            }
        } catch (IOException ignored) {
            // the player moved on (seek, close) — normal
        }
    }
}
