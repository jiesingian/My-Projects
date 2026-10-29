package com.jiesingian.kin;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * The page's way to the phone's push token (components/native-push.tsx,
 * lib/native.ts), as on the iPhone: one Firebase Cloud Messaging token,
 * channel "fcm". Until Kin has a Firebase project (google-services.json at
 * build time) there is none, and the app runs without push.
 */
@CapacitorPlugin(name = "KinPush")
public class KinPushPlugin extends Plugin {
    @PluginMethod
    public void tokens(PluginCall call) {
        JSObject out = new JSObject();
        if (FirebaseApp.getApps(getContext()).isEmpty()) {
            out.put("tokens", new JSArray());
            call.resolve(out);
            return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            JSArray list = new JSArray();
            if (task.isSuccessful() && task.getResult() != null) {
                JSObject t = new JSObject();
                t.put("channel", "fcm");
                t.put("token", task.getResult());
                t.put("env", "production");
                list.put(t);
            }
            out.put("tokens", list);
            call.resolve(out);
        });
    }
}
