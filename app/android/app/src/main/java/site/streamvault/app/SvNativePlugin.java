package site.streamvault.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Locale;

/**
 * What the StreamVault app needs from Android that a web view can't do:
 * the system downloader (offline copies, app updates), a local server that
 * plays downloaded files back with seeking, opening a file in another app,
 * installing an update, full-screen sideways playback — and Premium played
 * through the phone (RdStreamServer: Real-Debrid files relayed, loaded far
 * ahead, their Dolby/DTS audio converted).
 *
 * The TypeScript side is app/src/native/platform.ts (SvNativePlugin).
 */
@CapacitorPlugin(name = "SvNative")
public class SvNativePlugin extends Plugin {

    private LocalFileServer fileServer;
    private RdStreamServer rdServer;

    private synchronized RdStreamServer rd() throws IOException {
        if (rdServer == null) {
            boolean debuggable = (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            RdStreamServer server = new RdStreamServer(getContext(), debuggable);
            server.start();
            rdServer = server;
        }
        return rdServer;
    }

    @PluginMethod
    public void rdCaps(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("canConvert", rd().canConvert());
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Couldn't start the Premium server", e);
        }
    }

    @PluginMethod
    public void rdOpen(PluginCall call) {
        try {
            JSArray list = call.getArray("urls");
            List<String> urls = new java.util.ArrayList<>();
            if (list != null) for (int i = 0; i < list.length(); i++) urls.add(list.getString(i));
            RdStreamServer server = rd();
            String token = server.open(
                    urls,
                    call.getData().optLong("size", 0),
                    call.getData().optDouble("duration", 0),
                    call.getData().optInt("audioIndex", 0),
                    call.getData().optString("videoCodec", "")
            );
            JSObject result = new JSObject();
            result.put("token", token);
            result.put("fileUrl", server.fileUrl(token));
            result.put("convertUrl", server.canConvert() ? server.convertUrl(token) : JSObject.NULL);
            call.resolve(result);
        } catch (IllegalArgumentException | JSONException e) {
            call.reject(e.getMessage());
        } catch (IOException e) {
            call.reject("Couldn't start the Premium server", e);
        }
    }

    @PluginMethod
    public void rdClose(PluginCall call) {
        String token = call.getString("token");
        if (token != null && rdServer != null) rdServer.close(token);
        call.resolve();
    }

    private DownloadManager downloads() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    /** App-specific external storage: no permission needed, removed with the app. */
    private File folder(String kind) {
        String type = "updates".equals(kind) ? Environment.DIRECTORY_DOWNLOADS : Environment.DIRECTORY_MOVIES;
        File dir = getContext().getExternalFilesDir(type);
        if (dir == null) dir = new File(getContext().getFilesDir(), type);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    private boolean isOurs(File file) {
        try {
            String path = file.getCanonicalPath();
            return path.startsWith(folder("media").getCanonicalPath()) || path.startsWith(folder("updates").getCanonicalPath());
        } catch (IOException e) {
            return false;
        }
    }

    private static String safeName(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", " ").trim();
        if (cleaned.isEmpty()) cleaned = "video";
        return cleaned.length() > 120 ? cleaned.substring(cleaned.length() - 120) : cleaned;
    }

    @PluginMethod
    public void enqueue(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("A download needs an http(s) address");
            return;
        }
        String kind = call.getString("folder", "media");
        File dir = folder(kind);
        String name = safeName(call.getString("fileName"));
        File target = new File(dir, name);
        if ("updates".equals(kind)) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
        } else {
            int dot = name.lastIndexOf('.');
            String base = dot > 0 ? name.substring(0, dot) : name;
            String ext = dot > 0 ? name.substring(dot) : "";
            for (int n = 1; target.exists(); n++) target = new File(dir, base + " (" + n + ")" + ext);
        }

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle(call.getString("title", name));
        request.setDescription(call.getString("description", "StreamVault"));
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationUri(Uri.fromFile(target));
        boolean wifiOnly = Boolean.TRUE.equals(call.getBoolean("wifiOnly", false));
        request.setAllowedOverMetered(!wifiOnly);
        request.setAllowedOverRoaming(!wifiOnly);
        if ("updates".equals(kind)) request.setMimeType("application/vnd.android.package-archive");

        long id = downloads().enqueue(request);
        JSObject result = new JSObject();
        result.put("id", String.valueOf(id));
        result.put("path", target.getAbsolutePath());
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSArray ids = call.getArray("ids");
        JSArray items = new JSArray();
        try {
            List<String> list = ids == null ? java.util.Collections.emptyList() : ids.toList();
            if (!list.isEmpty()) {
                long[] numeric = new long[list.size()];
                for (int i = 0; i < list.size(); i++) numeric[i] = Long.parseLong(list.get(i));
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(numeric);
                try (Cursor c = downloads().query(query)) {
                    while (c != null && c.moveToNext()) {
                        JSObject item = new JSObject();
                        item.put("id", String.valueOf(c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID))));
                        int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        item.put("status", statusName(status));
                        item.put("bytes", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
                        item.put("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
                        String why = reasonText(status, reason);
                        if (why != null) item.put("reason", why);
                        items.put(item);
                    }
                }
            }
        } catch (JSONException | NumberFormatException e) {
            call.reject("Bad download ids", e);
            return;
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    private static String statusName(int status) {
        switch (status) {
            case DownloadManager.STATUS_SUCCESSFUL:
                return "done";
            case DownloadManager.STATUS_FAILED:
                return "failed";
            case DownloadManager.STATUS_PAUSED:
                return "paused";
            case DownloadManager.STATUS_RUNNING:
                return "running";
            default:
                return "pending";
        }
    }

    private static String reasonText(int status, int reason) {
        if (status == DownloadManager.STATUS_PAUSED) {
            switch (reason) {
                case DownloadManager.PAUSED_QUEUED_FOR_WIFI:
                    return "Waiting for Wi-Fi";
                case DownloadManager.PAUSED_WAITING_FOR_NETWORK:
                    return "Waiting for a connection";
                case DownloadManager.PAUSED_WAITING_TO_RETRY:
                    return "Retrying";
                default:
                    return null;
            }
        }
        if (status == DownloadManager.STATUS_FAILED) {
            switch (reason) {
                case DownloadManager.ERROR_INSUFFICIENT_SPACE:
                    return "Not enough storage";
                case DownloadManager.ERROR_FILE_ALREADY_EXISTS:
                    return "The file already exists";
                case DownloadManager.ERROR_CANNOT_RESUME:
                    return "The link expired — download it again";
                default:
                    return "The download failed (" + reason + ")";
            }
        }
        return null;
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            try {
                downloads().remove(Long.parseLong(id));
            } catch (NumberFormatException ignored) {
                // not one of ours
            }
        }
        String path = call.getString("path");
        if (path != null) {
            File file = new File(path);
            if (isOurs(file)) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void serve(PluginCall call) {
        String path = call.getString("path");
        File file = path == null ? null : new File(path);
        if (file == null || !file.isFile() || !isOurs(file)) {
            call.reject("That download is no longer on this phone");
            return;
        }
        try {
            if (fileServer == null) {
                fileServer = new LocalFileServer();
                fileServer.start();
            }
            JSObject result = new JSObject();
            result.put("url", fileServer.urlFor(file));
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Couldn't open the file for playback", e);
        }
    }

    private static String mimeOf(File file) {
        String name = file.getName().toLowerCase(Locale.ROOT);
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1) : "";
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if ("mkv".equals(ext)) return "video/x-matroska";
        return mime != null ? mime : "video/*";
    }

    private Uri shareable(File file) {
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    }

    @PluginMethod
    public void openWith(PluginCall call) {
        String path = call.getString("path");
        File file = path == null ? null : new File(path);
        if (file == null || !file.isFile() || !isOurs(file)) {
            call.reject("That download is no longer on this phone");
            return;
        }
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(shareable(file), call.getString("mimeType", mimeOf(file)));
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(view, "Play with");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(chooser);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No video player app is installed");
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String path = call.getString("path");
        File file = path == null ? null : new File(path);
        if (file == null || !file.isFile() || !isOurs(file)) {
            call.reject("The update file is missing");
            return;
        }
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.getPackageManager().canRequestPackageInstalls()) {
            Intent allow = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
            allow.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(allow);
            JSObject result = new JSObject();
            result.put("needsPermission", true);
            call.resolve(result);
            return;
        }
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(shareable(file), "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(install);
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (enabled) {
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.systemBars());
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void freeSpace(PluginCall call) {
        StatFs stat = new StatFs(folder("media").getAbsolutePath());
        JSObject result = new JSObject();
        result.put("bytes", stat.getAvailableBytes());
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (fileServer != null) fileServer.stop();
        if (rdServer != null) rdServer.stop();
        super.handleOnDestroy();
    }
}
