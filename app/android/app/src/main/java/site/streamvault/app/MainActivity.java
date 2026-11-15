package site.streamvault.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own native side (downloads, offline playback, updates) — see SvNativePlugin
        registerPlugin(SvNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
