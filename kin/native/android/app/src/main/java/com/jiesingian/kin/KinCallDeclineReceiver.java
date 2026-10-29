package com.jiesingian.kin;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Decline on the incoming-call notification (KinMessagingService): the
 * ringing stops, and the caller's phone is told, as the iPhone's CallKit
 * Decline and the browser notification's Decline do (api/calls/decline). Sent
 * with the web view's own session cookies, so it is the member saying no --
 * no token kept in the app.
 */
public class KinCallDeclineReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(intent.getIntExtra("code", 0));
        String call = intent.getStringExtra("call");
        String from = intent.getStringExtra("from");
        if (call == null) return;
        PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                String cookies = CookieManager.getInstance().getCookie(MainActivity.SERVER);
                if (cookies == null || cookies.isEmpty()) return;
                JSONObject body = new JSONObject().put("call", call).put("from", from == null ? "" : from);
                HttpURLConnection c = (HttpURLConnection) new URL(MainActivity.SERVER + "/api/calls/decline").openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setRequestProperty("Cookie", cookies);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                c.getResponseCode();
                c.disconnect();
            } catch (Exception ignored) {
                // No signal: the caller's ring stops by itself after a minute.
            } finally {
                pending.finish();
            }
        }).start();
    }
}
