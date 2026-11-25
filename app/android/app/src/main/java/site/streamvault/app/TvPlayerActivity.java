package site.streamvault.app;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.DefaultTimeBar;
import androidx.media3.ui.PlayerView;

import java.io.File;
import java.util.Collections;

/**
 * Premium on a TV, played by Android's own player (ExoPlayer) instead of the
 * web view: the picture goes straight to the screen's video layer and the
 * TV decodes Dolby audio itself, where the web view drew every frame through
 * the GPU and converted the audio with ffmpeg on the TV's CPU — too much for
 * a TV's chip (app/src/native/nativePlayer.ts starts it; SvNativePlugin.playNative).
 *
 * The remote: OK plays/pauses, ← → jump 10 s (and then scrub the time bar),
 * ↑ ↓ bring the controls (audio and subtitle tracks in their settings), Back
 * goes back to the app — which saves where the film stopped, and plays the
 * next episode when one ended.
 *
 * It tries the file's links in order (the nearest Real-Debrid server, then
 * the one it gave), then Real-Debrid's own conversion (H.264 + AAC) when the
 * file's audio is one this TV can't decode. If nothing plays it reports an
 * error and the app's own player takes over.
 */
@OptIn(markerClass = UnstableApi.class)
public class TvPlayerActivity extends AppCompatActivity {

    static final String EXTRA_URLS = "urls";
    static final String EXTRA_CONVERTED_URL = "convertedUrl";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_SUBTITLE = "subtitle";
    static final String EXTRA_START_MS = "startMs";
    static final String EXTRA_AUDIO_LANG = "audioLang";
    static final String EXTRA_SUBS_PATH = "subsPath";
    static final String EXTRA_SUBS_LANG = "subsLang";

    static final String RESULT_POSITION_MS = "positionMs";
    static final String RESULT_DURATION_MS = "durationMs";
    static final String RESULT_ENDED = "ended";
    static final String RESULT_ERROR = "error";

    private static final long SEEK_MS = 10_000;
    /** A network hiccup mid-film: try the same link again this many times before giving up. */
    private static final int MAX_RETRIES = 3;

    private ExoPlayer player;
    private PlayerView view;
    private View titleBar;
    private String[] urls = new String[0];
    private String convertedUrl;
    private int urlIndex = 0;
    private boolean onConverted = false;
    private boolean started = false;
    private boolean audioChecked = false;
    private boolean ended = false;
    private int retries = 0;
    private boolean finishing = false;
    private String error = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        String[] given = intent.getStringArrayExtra(EXTRA_URLS);
        if (given != null) urls = given;
        convertedUrl = intent.getStringExtra(EXTRA_CONVERTED_URL);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insets.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        insets.hide(WindowInsetsCompat.Type.systemBars());

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setShowNextButton(false);
        view.setShowPreviousButton(false);
        view.setShowSubtitleButton(true);
        view.setControllerShowTimeoutMs(4000);
        view.setKeepScreenOn(true);
        root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        titleBar = buildTitleBar(intent.getStringExtra(EXTRA_TITLE), intent.getStringExtra(EXTRA_SUBTITLE));
        root.addView(titleBar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        setContentView(root);
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> titleBar.setVisibility(visibility));

        // Minutes ahead, not the default 50 s: a Real-Debrid server now and then goes quiet for a few seconds
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(60_000, 240_000, 2_500, 5_000)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build();
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this).setEnableDecoderFallback(true);
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
            .setUserAgent("StreamVault");
        player = new ExoPlayer.Builder(this, renderers)
            .setLoadControl(loadControl)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(http))
            .setSeekBackIncrementMs(SEEK_MS)
            .setSeekForwardIncrementMs(SEEK_MS)
            .setHandleAudioBecomingNoisy(true)
            .build();
        String audioLang = intent.getStringExtra(EXTRA_AUDIO_LANG);
        if (!TextUtils.isEmpty(audioLang)) {
            player.setTrackSelectionParameters(player.getTrackSelectionParameters().buildUpon().setPreferredAudioLanguage(audioLang).build());
        }
        player.addListener(listener);
        view.setPlayer(player);

        DefaultTimeBar timeBar = view.findViewById(androidx.media3.ui.R.id.exo_progress);
        if (timeBar != null) timeBar.setKeyTimeIncrement(SEEK_MS);

        if (urls.length == 0 && TextUtils.isEmpty(convertedUrl)) {
            error = "nothing to play";
            done();
            return;
        }
        if (urls.length == 0) onConverted = true;
        load(intent.getLongExtra(EXTRA_START_MS, 0));

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                done();
            }
        });
    }

    private View buildTitleBar(String title, String subtitle) {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(28);
        bar.setPadding(dp(48), pad, dp(48), dp(40));
        bar.setBackground(new android.graphics.drawable.GradientDrawable(
            android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM, new int[] { 0xCC000000, 0x00000000 }));
        TextView name = new TextView(this);
        name.setText(title == null ? "" : title);
        name.setTextColor(Color.WHITE);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        name.setTypeface(name.getTypeface(), android.graphics.Typeface.BOLD);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        bar.addView(name);
        if (!TextUtils.isEmpty(subtitle)) {
            TextView line = new TextView(this);
            line.setText(subtitle);
            line.setTextColor(0xB3FFFFFF);
            line.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            bar.addView(line);
        }
        return bar;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /** Play the current source from `positionMs`. */
    private void load(long positionMs) {
        String url = onConverted ? convertedUrl : urls[urlIndex];
        MediaItem.Builder item = new MediaItem.Builder().setUri(Uri.parse(url));
        if (onConverted) item.setMimeType(MimeTypes.APPLICATION_M3U8);
        String subsPath = getIntent().getStringExtra(EXTRA_SUBS_PATH);
        if (!TextUtils.isEmpty(subsPath) && new File(subsPath).exists()) {
            MediaItem.SubtitleConfiguration subs = new MediaItem.SubtitleConfiguration.Builder(Uri.fromFile(new File(subsPath)))
                .setMimeType(MimeTypes.TEXT_VTT)
                .setLanguage(getIntent().getStringExtra(EXTRA_SUBS_LANG))
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                .build();
            item.setSubtitleConfigurations(Collections.singletonList(subs));
        }
        audioChecked = false;
        player.setMediaItem(item.build(), Math.max(0, positionMs));
        player.setPlayWhenReady(true);
        player.prepare();
    }

    /** The next way of playing the file, from where it is; false when there's none left. */
    private boolean nextSource() {
        long at = Math.max(0, player.getCurrentPosition());
        if (!onConverted && urlIndex + 1 < urls.length) {
            urlIndex++;
            load(at);
            return true;
        }
        if (!onConverted && !TextUtils.isEmpty(convertedUrl)) {
            onConverted = true;
            load(at);
            return true;
        }
        return false;
    }

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onRenderedFirstFrame() {
            started = true;
            retries = 0;
        }

        @Override
        public void onPlaybackStateChanged(int state) {
            if (state == Player.STATE_READY) retries = 0;
            if (state == Player.STATE_ENDED) {
                ended = true;
                done();
            }
        }

        @Override
        public void onTracksChanged(@NonNull Tracks tracks) {
            if (audioChecked || tracks.isEmpty()) return;
            audioChecked = true;
            // Dolby/DTS this TV can't decode would play in silence: Real-Debrid's conversion has AAC
            boolean hasAudio = tracks.containsType(C.TRACK_TYPE_AUDIO);
            boolean audioPlays = tracks.isTypeSupported(C.TRACK_TYPE_AUDIO);
            if (hasAudio && !audioPlays && !nextSource()) {
                error = "audio-unsupported";
                done();
            }
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException e) {
            if (started && retries < MAX_RETRIES) {
                // Mid-film: the same link again, from where it stopped
                retries++;
                player.prepare();
                return;
            }
            if (nextSource()) return;
            error = e.getErrorCodeName();
            done();
        }
    };

    /** Back to the app, saying where the film got to. */
    private void done() {
        if (finishing) return;
        finishing = true;
        Intent result = new Intent();
        if (player != null) {
            long duration = player.getDuration();
            result.putExtra(RESULT_POSITION_MS, Math.max(0, player.getCurrentPosition()));
            result.putExtra(RESULT_DURATION_MS, duration == C.TIME_UNSET ? 0 : duration);
        }
        result.putExtra(RESULT_ENDED, ended);
        if (error != null) result.putExtra(RESULT_ERROR, started ? "stopped: " + error : error);
        setResult(RESULT_OK, result);
        finish();
    }

    /**
     * With the controls away, ← → jump 10 s and OK plays/pauses — then the
     * controls come up on the time bar, where ← → go on scrubbing 10 s at a time.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // OK on the time bar plays/pauses too (it would do nothing there)
        if (player != null && event.getAction() == KeyEvent.ACTION_DOWN && view.isControllerFullyVisible() && isOk(event.getKeyCode())) {
            View focused = getCurrentFocus();
            if (focused != null && focused.getId() == androidx.media3.ui.R.id.exo_progress) {
                if (player.isPlaying()) player.pause();
                else player.play();
                view.showController();
                return true;
            }
        }
        if (player != null && event.getAction() == KeyEvent.ACTION_DOWN && !view.isControllerFullyVisible()) {
            int key = event.getKeyCode();
            if (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                if (key == KeyEvent.KEYCODE_DPAD_LEFT) player.seekBack();
                else player.seekForward();
                showControlsOn(androidx.media3.ui.R.id.exo_progress);
                return true;
            }
            if (isOk(key)) {
                if (player.isPlaying()) player.pause();
                else player.play();
                showControlsOn(androidx.media3.ui.R.id.exo_play_pause);
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private static boolean isOk(int key) {
        return key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER;
    }

    private void showControlsOn(int id) {
        view.showController();
        View target = view.findViewById(id);
        if (target != null) target.post(target::requestFocus);
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null && !isFinishing()) player.pause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.removeListener(listener);
            player.release();
            player = null;
        }
    }
}
