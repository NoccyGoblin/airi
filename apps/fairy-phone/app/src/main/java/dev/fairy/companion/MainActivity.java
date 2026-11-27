package dev.fairy.companion;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The phone window to the character that runs on the PC. It shows the phone page that the PC serves on the
 * Tailscale network, so the phone and the PC share one character, one memory, and every tool.
 *
 * - The first start asks for the pairing link, or takes it from the "Connect the app" button of the page in Chrome.
 * - Opened by the assistant button, it starts listening at once.
 */
public class MainActivity extends Activity {
    /** Set by the assistant session: start listening as soon as the page is ready. */
    public static final String EXTRA_LISTEN = "listen";

    private static final String PREFS = "fairy";
    private static final String PAGE_URL = "pageUrl";
    private static final int PICK_FILE = 1;
    private static final int ASK_MIC = 2;

    private WebView web;
    private boolean pageReady;
    private boolean listenWhenReady;
    private ValueCallback<Uri[]> pendingFiles;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, ASK_MIC);

        listenWhenReady = getIntent().getBooleanExtra(EXTRA_LISTEN, false);
        if (savePairing(getIntent()))
            return;
        String url = prefs().getString(PAGE_URL, null);
        if (url == null)
            showSetup();
        else
            showPage(url);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (savePairing(intent))
            return;
        if (intent.getBooleanExtra(EXTRA_LISTEN, false)) {
            if (pageReady)
                listen();
            else
                listenWhenReady = true;
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    /** A pairing link from the page in Chrome: fairycompanion://pair?u=https://host&k=key. */
    private boolean savePairing(Intent intent) {
        Uri data = intent.getData();
        if (data == null || !"fairycompanion".equals(data.getScheme()) || !"pair".equals(data.getHost()))
            return false;
        String origin = data.getQueryParameter("u");
        String key = data.getQueryParameter("k");
        if (origin == null || key == null || !origin.startsWith("https://"))
            return false;
        String url = origin.replaceAll("/+$", "") + "/?key=" + Uri.encode(key);
        prefs().edit().putString(PAGE_URL, url).apply();
        showPage(url);
        return true;
    }

    /** The first start without a pairing: paste the link from the QR code in the PC app. */
    private void showSetup() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        layout.setPadding(48, 48, 48, 48);
        layout.setBackgroundColor(Color.rgb(22, 19, 31));

        TextView text = new TextView(this);
        text.setTextColor(Color.rgb(239, 234, 255));
        text.setTextSize(17);
        text.setText("Connect to your companion\n\nOn the phone page in Chrome, tap \"Connect the app\". Or paste the pairing link from the QR code (Settings, Phone on the PC) here.");
        layout.addView(text);

        EditText link = new EditText(this);
        link.setHint("https://…/?key=…");
        link.setTextColor(Color.WHITE);
        link.setHintTextColor(Color.GRAY);
        link.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        layout.addView(link);

        Button connect = new Button(this);
        connect.setText("Connect");
        connect.setOnClickListener(view -> {
            String url = link.getText().toString().trim();
            if (!url.startsWith("https://") || !url.contains("key=")) {
                text.setText("That is not a pairing link. It starts with https:// and has key= in it.");
                return;
            }
            prefs().edit().putString(PAGE_URL, url).apply();
            showPage(url);
        });
        layout.addView(connect);
        setContentView(layout);
    }

    private void showPage(String url) {
        pageReady = false;
        if (web == null) {
            web = new WebView(this);
            web.setBackgroundColor(Color.rgb(22, 19, 31));
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            // Her spoken reply plays without a tap, as an assistant answer does.
            settings.setMediaPlaybackRequiresUserGesture(false);
            // The page hides its "get the app" offer inside the app.
            settings.setUserAgentString(settings.getUserAgentString() + " FairyCompanionApp/1");
            web.setWebViewClient(new PageClient());
            web.setWebChromeClient(new PageChrome());
        }
        if (web.getParent() == null)
            setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(url);
    }

    /** Starts hands-free listening on the page: it records until the owner stops talking. */
    private void listen() {
        if (web != null)
            web.evaluateJavascript("window.fairyListen && window.fairyListen()", null);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack())
            web.goBack();
        else
            super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_FILE && pendingFiles != null) {
            pendingFiles.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            pendingFiles = null;
        }
    }

    private class PageClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            pageReady = true;
            if (listenWhenReady) {
                listenWhenReady = false;
                // The page connects first, then the microphone starts.
                view.postDelayed(MainActivity.this::listen, 600);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri target = request.getUrl();
            String home = prefs().getString(PAGE_URL, "");
            if (home.startsWith("https://" + target.getHost() + "/"))
                return false;
            // Links to other sites open in the browser, never inside the app.
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, target));
            }
            catch (Exception ignored) {
            }
            return true;
        }
    }

    private class PageChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            // The page asks for the microphone for voice messages. Only the paired page loads here.
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                runOnUiThread(() -> request.grant(new String[] { PermissionRequest.RESOURCE_AUDIO_CAPTURE }));
            else
                runOnUiThread(request::deny);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null)
                pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            try {
                startActivityForResult(params.createIntent(), PICK_FILE);
            }
            catch (Exception error) {
                pendingFiles = null;
                return false;
            }
            return true;
        }
    }
}
