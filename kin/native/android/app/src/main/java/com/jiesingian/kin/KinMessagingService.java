package com.jiesingian.kin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Kin's push on Android (lib/fcm.ts). An Android web view can't take Web
 * Push, so every Kin notification reaches the app this way, as a data
 * message, and is shown here:
 * - a ringing call: Android's own incoming-call notification (CallStyle),
 *   full screen on a locked phone, ringing until answered, declined or a
 *   minute passes. Answer opens the call in Kin (/chat?answer=<id>); Decline
 *   tells the caller (KinCallDeclineReceiver).
 * - an SOS: on its own urgent channel, through Do Not Disturb.
 * - everything else: an ordinary notification that opens its page.
 * Off until Kin has a Firebase project (google-services.json; SETUP).
 */
public class KinMessagingService extends FirebaseMessagingService {
    static final String CALLS = "kin-calls";
    static final String URGENT = "kin-urgent";
    static final String GENERAL = "kin";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> d = message.getData();
        if ("ring".equals(d.get("kind"))) ring(this, d);
        else notify(this, d);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // The page saves the token each time Kin opens (components/native-push.tsx).
    }

    static void ring(Context context, Map<String, String> d) {
        ensureChannels(context);
        String callId = d.get("call_id");
        if (callId == null || callId.isEmpty()) return;
        String caller = d.get("caller") == null || d.get("caller").isEmpty() ? "Kin" : d.get("caller");
        int code = ("call:" + callId).hashCode();
        String path = "/chat?answer=" + Uri.encode(callId);
        PendingIntent answer = PendingIntent.getActivity(context, code, KinAlarms.openIntent(context, path).putExtra("dismiss", code), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent declineIntent = new Intent(context, KinCallDeclineReceiver.class)
            .putExtra("call", callId)
            .putExtra("from", d.get("call_from"))
            .putExtra("code", code);
        PendingIntent decline = PendingIntent.getBroadcast(context, code + 1, declineIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Person person = new Person.Builder().setName(caller).setImportant(true).build();
        Notification n = new NotificationCompat.Builder(context, CALLS)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(caller)
            .setContentText("true".equals(d.get("video")) ? "Kin video call" : "Kin call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer))
            .setFullScreenIntent(answer, true)
            .setContentIntent(answer)
            .setOngoing(true)
            // An unanswered ring stops after a minute, as the caller's does.
            .setTimeoutAfter(60_000)
            .build();
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(code, n);
    }

    static void notify(Context context, Map<String, String> d) {
        ensureChannels(context);
        boolean urgent = "true".equals(d.get("urgent"));
        String tag = d.get("tag") == null ? "kin" : d.get("tag");
        int code = tag.hashCode();
        PendingIntent open = PendingIntent.getActivity(context, code, KinAlarms.openIntent(context, d.get("url")), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(context, urgent ? URGENT : GENERAL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(d.get("title") == null ? "Kin" : d.get("title"))
            .setContentText(d.get("body") == null ? "" : d.get("body"))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(d.get("body") == null ? "" : d.get("body")))
            .setPriority(urgent ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(urgent ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build();
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(tag, 0, n);
    }

    static void ensureChannels(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CALLS) == null) {
            NotificationChannel calls = new NotificationChannel(CALLS, "Calls", NotificationManager.IMPORTANCE_HIGH);
            calls.setDescription("A family member calling you on Kin.");
            calls.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
            calls.enableVibration(true);
            nm.createNotificationChannel(calls);
        }
        if (nm.getNotificationChannel(URGENT) == null) {
            NotificationChannel urgent = new NotificationChannel(URGENT, "SOS", NotificationManager.IMPORTANCE_HIGH);
            urgent.setDescription("An SOS from your family, and anything else that can't wait.");
            urgent.setBypassDnd(true);
            urgent.enableVibration(true);
            nm.createNotificationChannel(urgent);
        }
        if (nm.getNotificationChannel(GENERAL) == null) {
            nm.createNotificationChannel(new NotificationChannel(GENERAL, "Kin", NotificationManager.IMPORTANCE_DEFAULT));
        }
    }
}
