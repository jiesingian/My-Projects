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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }
        afterNotifications(call);
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        // Exact alarms are a switch of their own on Android 12 and 13
        // (Alarms & reminders): the settings page opens once, the first time.
        if (!KinAlarms.canSchedule(getContext()) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
            } catch (Exception ignored) {
                // No such page on this phone: alarms stay off until allowed.
            }
        }
        call.resolve(currentStatus());
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
        return out;
    }
}
