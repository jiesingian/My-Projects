package com.jiesingian.kin;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;

/**
 * A Kin alarm going off (KinAlarms), and the phone restarting. The alarm is a
 * notification with a full-screen intent: on a locked or idle phone Android
 * opens KinAlarmActivity at once, full screen and ringing; on a phone in use
 * it shows as a heads-up with Stop and Open.
 */
public class KinAlarmReceiver extends BroadcastReceiver {
    static final String ACTION_RING = "com.jiesingian.kin.ALARM";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            || "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action)) {
            KinAlarms.scheduleStored(context);
            return;
        }
        if (!ACTION_RING.equals(action)) return;
        show(context, intent.getStringExtra("id"), intent.getStringExtra("title"), intent.getStringExtra("body"), intent.getStringExtra("url"));
    }

    static void show(Context context, String id, String title, String body, String url) {
        KinAlarms.ensureChannel(context);
        int code = id == null ? 0 : id.hashCode();
        Intent ring = new Intent(context, KinAlarmActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION)
            .putExtra("code", code)
            .putExtra("title", title)
            .putExtra("body", body)
            .putExtra("url", url);
        PendingIntent full = PendingIntent.getActivity(context, code, ring, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open = PendingIntent.getActivity(context, code + 1, KinAlarms.openIntent(context, url), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(context, KinAlarms.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_kin)
            .setContentTitle(title == null ? "Kin" : title)
            .setContentText(body == null ? "" : body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(full, true)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setOngoing(true)
            .addAction(0, "Open", open)
            .build();
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(code, n);
    }
}
