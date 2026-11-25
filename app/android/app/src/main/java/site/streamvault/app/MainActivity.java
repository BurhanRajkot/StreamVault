package site.streamvault.app;

import android.app.UiModeManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own native side (downloads, offline playback, updates) — see SvNativePlugin
        registerPlugin(SvNativePlugin.class);
        super.onCreate(savedInstanceState);
        if (isTv(this)) {
            // A TV's web view is only ~960 CSS px wide (1080p at density 2) — the phone layout.
            // Let the page set a wider viewport (app/src/tv/tvMode.ts) and fit it to the screen.
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
        }
    }

    /** Android TV / Google TV: worked with a remote, on a big screen across the room. */
    static boolean isTv(Context context) {
        UiModeManager uiMode = (UiModeManager) context.getSystemService(Context.UI_MODE_SERVICE);
        if (uiMode != null && uiMode.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        return context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
    }
}
