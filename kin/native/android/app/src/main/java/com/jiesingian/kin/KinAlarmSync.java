package com.jiesingian.kin;

import android.content.Context;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;

/**
 * Keeps the Android app's alarms topped up without Kin being opened, like
 * the iPhone's KinAlarmSync (Jonathan, 29 October). The server sends a silent
 * Firebase data message `sync: alarms` once a day and after a change that
 * moves an alarm (due_alarm_wakes, lib/fcm.ts fcmWakeMessage);
 * KinMessagingService hands it here.
 *
 * It asks api/alarms as the member, with the web view's own session cookies
 * (CookieManager), and sets the answer as KinAlarmsPlugin.replaceAll does.
 * If the server refreshes the session on the way, its new cookies go back
 * into the web view's store: Supabase's refresh token is used once, so
 * dropping the new one would sign the member out of Kin. Signed out (401),
 * or anything else gone wrong: the alarms already set stay as they are.
 *
 * Runs on Firebase's own worker thread, which allows a few seconds of
 * network; never on the main thread.
 */
final class KinAlarmSync {
    private static final int TIMEOUT_MS = 10_000;

    private KinAlarmSync() {}

    static void run(Context context) {
        HttpURLConnection http = null;
        try {
            String url = MainActivity.SERVER + "/api/alarms";
            CookieManager cookies = CookieManager.getInstance();
            String cookie = cookies.getCookie(MainActivity.SERVER);
            if (cookie == null || cookie.isEmpty()) return;

            http = (HttpURLConnection) new URL(url).openConnection();
            http.setConnectTimeout(TIMEOUT_MS);
            http.setReadTimeout(TIMEOUT_MS);
            http.setInstanceFollowRedirects(false);
            http.setRequestProperty("Cookie", cookie);
            http.setRequestProperty("Accept", "application/json");
            int status = http.getResponseCode();

            Map<String, List<String>> fields = http.getHeaderFields();
            for (Map.Entry<String, List<String>> e : fields.entrySet()) {
                if (e.getKey() == null || !"set-cookie".equalsIgnoreCase(e.getKey())) continue;
                for (String c : e.getValue()) cookies.setCookie(MainActivity.SERVER, c);
            }
            cookies.flush();

            if (status != 200) return;
            JSONArray alarms = new JSONObject(read(http.getInputStream())).optJSONArray("alarms");
            if (alarms != null) KinAlarms.replaceAll(context, alarms);
        } catch (Exception ignored) {
            // Offline or a bad answer: the alarms already set stay; the next
            // wake, or the next time Kin opens, tries again.
        } finally {
            if (http != null) http.disconnect();
        }
    }

    private static String read(InputStream in) throws java.io.IOException {
        try (InputStream s = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            for (int n; (n = s.read(buf)) != -1; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }
}
