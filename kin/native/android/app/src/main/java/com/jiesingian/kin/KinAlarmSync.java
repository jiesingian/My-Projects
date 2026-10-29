package com.jiesingian.kin;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Keeps the Android app's alarms topped up without Kin being opened, like
 * the iPhone's KinAlarmSync (Jonathan, 29 October). The server sends a silent
 * Firebase data message `sync: alarms` once a day and after a change that
 * moves an alarm (due_alarm_wakes, lib/fcm.ts fcmWakeMessage);
 * KinMessagingService hands it here.
 *
 * It asks api/alarms as the member, with the web view's own session cookies
 * (KinSession, which keeps any refreshed cookie), and sets the answer as
 * KinAlarmsPlugin.replaceAll does. Signed out (401), or anything else gone
 * wrong: the alarms already set stay as they are.
 *
 * Runs on Firebase's own worker thread, which allows a few seconds of
 * network; never on the main thread.
 */
final class KinAlarmSync {
    private KinAlarmSync() {}

    static void run(Context context) {
        KinSession.Answer answer = KinSession.get("/api/alarms");
        // Offline or a bad answer: the alarms already set stay; the next
        // wake, or the next time Kin opens, tries again.
        if (answer == null || answer.status != 200) return;
        try {
            JSONArray alarms = new JSONObject(answer.body).optJSONArray("alarms");
            if (alarms != null) KinAlarms.replaceAll(context, alarms);
        } catch (Exception ignored) {
            // Not the answer expected: as above.
        }
    }
}
