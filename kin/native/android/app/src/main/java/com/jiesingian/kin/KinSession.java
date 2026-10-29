package com.jiesingian.kin;

import android.webkit.CookieManager;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.Map;

/**
 * A request to Kin as the signed-in member, from the app itself rather than
 * the page, like the iPhone's KinSession (KinWidgetStore.swift): the alarm
 * re-sync (KinAlarmSync) and the widgets (KinWidgets) both need one, often
 * with no page loaded.
 *
 * It carries the web view's own session cookies (CookieManager), the one
 * place the session lives: no second login or token kept in the app, the
 * route reads through row-level security as the member exactly as the page
 * does, and signing out in Kin ends it too. If the server refreshes the
 * session on the way, its new cookies go back into the web view's store:
 * Supabase's refresh token is used once, so dropping the new one would sign
 * the member out of Kin. One request at a time, so two never spend the same
 * refresh token.
 *
 * Never on the main thread.
 */
final class KinSession {
    private static final int TIMEOUT_MS = 10_000;

    /** No cookie at all: nobody is signed in, so the answer is a 401. */
    static final int SIGNED_OUT = 401;

    static final class Answer {
        final int status;
        final String body;

        Answer(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    private KinSession() {}

    /** The status and, on a 200, the body; null with no signal or a bad answer. */
    static synchronized Answer get(String path) {
        HttpURLConnection http = null;
        try {
            CookieManager cookies = CookieManager.getInstance();
            String cookie = cookies.getCookie(MainActivity.SERVER);
            if (cookie == null || cookie.isEmpty()) return new Answer(SIGNED_OUT, null);

            http = (HttpURLConnection) new URL(MainActivity.SERVER + path).openConnection();
            http.setConnectTimeout(TIMEOUT_MS);
            http.setReadTimeout(TIMEOUT_MS);
            http.setInstanceFollowRedirects(false);
            http.setUseCaches(false);
            http.setRequestProperty("Cookie", cookie);
            http.setRequestProperty("Accept", "application/json");
            int status = http.getResponseCode();

            Map<String, List<String>> fields = http.getHeaderFields();
            for (Map.Entry<String, List<String>> e : fields.entrySet()) {
                if (e.getKey() == null || !"set-cookie".equalsIgnoreCase(e.getKey())) continue;
                for (String c : e.getValue()) cookies.setCookie(MainActivity.SERVER, c);
            }
            cookies.flush();

            return new Answer(status, status == 200 ? read(http.getInputStream()) : null);
        } catch (Exception ignored) {
            return null;
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
