package com.jiesingian.kin;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Kin's real alarms on Android (Jonathan, 29 October), the same list the
 * iPhone app gets (api/alarms, lib/alarms.ts): medicine doses, and the plans,
 * check-ups and bills a member switched on.
 *
 * Each is an exact alarm (AlarmManager.setAlarmClock, so it rings on time
 * even in Doze, and shows as the phone's next alarm). When it fires,
 * KinAlarmReceiver posts a notification with a full-screen intent, which
 * opens KinAlarmActivity over the lock screen, ringing on the alarm stream
 * like the Clock app. The list is kept here too, so a restart sets it again
 * (BOOT_COMPLETED).
 */
final class KinAlarms {
    static final String CHANNEL = "kin-alarms";
    static final int MAX = 60;
    private static final String PREFS = "kin-alarms";
    private static final String KEY = "list";

    private KinAlarms() {}

    /** Every alarm Kin set before is cancelled and this list is set. */
    static int replaceAll(Context context, JSONArray alarms) {
        cancelAll(context);
        JSONArray kept = new JSONArray();
        long now = System.currentTimeMillis();
        for (int i = 0; i < alarms.length() && kept.length() < MAX; i++) {
            JSONObject a = alarms.optJSONObject(i);
            if (a == null) continue;
            long at = parseAt(a.optString("at"));
            if (at <= now || a.optString("id").isEmpty()) continue;
            kept.put(a);
        }
        prefs(context).edit().putString(KEY, kept.toString()).apply();
        return scheduleStored(context);
    }

    /** Sets the stored list again: after a restart, or once exact alarms are allowed. */
    static int scheduleStored(Context context) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        if (manager == null || !canSchedule(context)) return 0;
        ensureChannel(context);
        int count = 0;
        long now = System.currentTimeMillis();
        for (JSONObject a : stored(context)) {
            long at = parseAt(a.optString("at"));
            if (at <= now) continue;
            PendingIntent show = PendingIntent.getActivity(context, requestCode(a), openIntent(context, a.optString("url", "/today")), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            manager.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), fireIntent(context, a));
            count++;
        }
        return count;
    }

    static int scheduledCount(Context context) {
        long now = System.currentTimeMillis();
        int n = 0;
        for (JSONObject a : stored(context)) if (parseAt(a.optString("at")) > now) n++;
        return n;
    }

    /** Android 14 and later let the person (or Google Play) take away the
     * full screen: an alarm then rings as a heads-up notification instead. */
    static boolean canUseFullScreen(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        return nm != null && nm.canUseFullScreenIntent();
    }

    static boolean canSchedule(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        return manager != null && manager.canScheduleExactAlarms();
    }

    private static void cancelAll(Context context) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        if (manager == null) return;
        for (JSONObject a : stored(context)) manager.cancel(fireIntent(context, a));
    }

    private static PendingIntent fireIntent(Context context, JSONObject a) {
        Intent intent = new Intent(context, KinAlarmReceiver.class)
            .setAction(KinAlarmReceiver.ACTION_RING)
            .putExtra("id", a.optString("id"))
            .putExtra("title", a.optString("title", "Kin"))
            .putExtra("body", a.optString("body", ""))
            .putExtra("url", a.optString("url", "/today"));
        return PendingIntent.getBroadcast(context, requestCode(a), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Opens Kin on a page: only ever one of Kin's own paths. */
    static Intent openIntent(Context context, String path) {
        String safe = path != null && path.startsWith("/") && !path.startsWith("//") ? path : "/today";
        return new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(MainActivity.EXTRA_PATH, safe);
    }

    /** The same alarm always gets the same code. */
    static int requestCode(JSONObject a) {
        return a.optString("id").hashCode();
    }

    static void ensureChannel(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Alarms", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Medicine doses, and the plans, check-ups and bills you choose, ringing like an alarm clock.");
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        channel.enableVibration(true);
        channel.setBypassDnd(true);
        nm.createNotificationChannel(channel);
    }

    private static List<JSONObject> stored(Context context) {
        List<JSONObject> out = new ArrayList<>();
        try {
            JSONArray list = new JSONArray(prefs(context).getString(KEY, "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.optJSONObject(i);
                if (a != null) out.add(a);
            }
        } catch (JSONException ignored) {
            // A list that can't be read is no list: the next open sends it again.
        }
        return out;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static long parseAt(String iso) {
        try {
            return Instant.parse(iso).toEpochMilli();
        } catch (Exception e) {
            return 0;
        }
    }
}
