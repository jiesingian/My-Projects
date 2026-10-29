package com.jiesingian.kin;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

/**
 * The page's way to Kin's alarms on Android, the same three methods as the
 * iPhone's (lib/native.ts, KinAlarmsPlugin.swift): `status`, `authorize`
 * and `replaceAll`. components/native-alarm-sync.tsx hands it the next two
 * weeks each time Kin opens.
 */
@CapacitorPlugin(
    name = "KinAlarms",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class KinAlarmsPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(currentStatus());
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        PermissionState asked = getPermissionState("notifications");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && (asked == PermissionState.PROMPT || asked == PermissionState.PROMPT_WITH_RATIONALE)) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }
        next(call);
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        // "Don't allow" just now: no settings page straight after it.
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            call.resolve(currentStatus());
            return;
        }
        next(call);
    }

    private void next(PluginCall call) {
        // Exact alarms are a switch of their own from Android 12 (Alarms &
        // reminders), off by default on a new install from Android 14: its
        // settings page opens. Once they're allowed, the next tap opens the
        // full-screen switch if Android 14+ took that away. One page per tap.
        // Coming back, KinAlarmReceiver sets the stored list as soon as exact
        // alarms are allowed.
        // Notifications said no once already, so Android shows no question:
        // Kin's notification settings open instead.
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            openSettings(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        } else if (!KinAlarms.canSchedule(getContext()) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            openSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        } else if (!KinAlarms.canUseFullScreen(getContext()) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            openSettings(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
        }
        call.resolve(currentStatus());
    }

    private void openSettings(String action) {
        String pkg = getContext().getPackageName();
        Intent intent = Settings.ACTION_APP_NOTIFICATION_SETTINGS.equals(action)
            ? new Intent(action).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            : new Intent(action, Uri.parse("package:" + pkg));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception ignored) {
            // No such page on this phone: the app's own settings page instead.
            try {
                getContext().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception alsoIgnored) {
                // Nothing to open: the page's words say where to look.
            }
        }
    }

    @PluginMethod
    public void replaceAll(PluginCall call) {
        JSArray alarms = call.getArray("alarms", new JSArray());
        KinAlarms.replaceAll(getContext(), alarms == null ? new JSONArray() : alarms);
        call.resolve(currentStatus());
    }

    private JSObject currentStatus() {
        boolean notifications = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        boolean exact = KinAlarms.canSchedule(getContext());
        String state;
        if (notifications && exact) state = "authorized";
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") == PermissionState.PROMPT) state = "notDetermined";
        else state = "denied";
        JSObject out = new JSObject();
        out.put("engine", "android");
        out.put("authorization", state);
        out.put("scheduled", KinAlarms.scheduledCount(getContext()));
        out.put("fullScreen", KinAlarms.canUseFullScreen(getContext()));
        return out;
    }
}
