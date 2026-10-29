package com.jiesingian.kin;

import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * Kin's Android app (kin/native/android): the live web app in Capacitor's
 * web view, with Kin's own native plugins -- real alarms (KinAlarmsPlugin)
 * and push (KinPushPlugin) -- which the page reaches as
 * Capacitor.Plugins.<name> (lib/native.ts). An alarm, a notification or an
 * answered call opens it on a page (EXTRA_PATH).
 */
public class MainActivity extends BridgeActivity {
    static final String SERVER = "https://kin-family-app.vercel.app";
    static final String EXTRA_PATH = "kin_path";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(KinAlarmsPlugin.class);
        registerPlugin(KinPushPlugin.class);
        super.onCreate(savedInstanceState);
        openFrom(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openFrom(intent);
    }

    private void openFrom(Intent intent) {
        if (intent == null) return;
        int dismiss = intent.getIntExtra("dismiss", 0);
        if (dismiss != 0) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.cancel(dismiss);
        }
        String path = intent.getStringExtra(EXTRA_PATH);
        if (path == null || !path.startsWith("/") || path.startsWith("//") || getBridge() == null) return;
        intent.removeExtra(EXTRA_PATH);
        WebView web = getBridge().getWebView();
        // After the first page has started, so this one wins.
        web.postDelayed(() -> web.loadUrl(SERVER + path), 300);
    }
}
