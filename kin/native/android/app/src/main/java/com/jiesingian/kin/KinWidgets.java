package com.jiesingian.kin;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.text.format.DateFormat;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Date;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Kin's Android Home Screen widgets, the twin of the iPhone's (KinWidgets,
 * KinWidgetStore.swift): Today's next dose and next plan (KinTodayWidget),
 * and how many things are on the To-Buy list (KinToBuyWidget).
 *
 * The widget never signs in or asks the server. The app reads api/widget as
 * the member (lib/widget.ts, through KinSession: the web view's own cookies)
 * when Kin opens and goes to the background (MainActivity), when the silent
 * `sync: alarms` message wakes it (KinMessagingService), and each widget
 * update period (30 minutes, Android's least), and keeps the answer in the
 * app's own SharedPreferences; the widgets are drawn from there. The rest of
 * the day's doses and plans ride along, so the widget steps on to the next
 * one at its time by itself (an alarm, TICK, at the next moment it changes).
 * Signed out (401): the snapshot is dropped, so nobody's medicines stay on a
 * Home Screen. Tapping opens Kin at the live page (MainActivity's
 * EXTRA_PATH, only Kin's own paths).
 */
final class KinWidgets {
    static final String TICK = "com.jiesingian.kin.WIDGET_TICK";
    private static final String PREFS = "kin_widgets";
    private static final String KEY = "snapshot";
    private static final String READ_AT = "read_at";
    /** A dose still not taken an hour after its time stays shown, as late. */
    private static final long LATE_FOR = 3_600_000L;
    /** Both widgets' update periods ask; one read covers them. */
    private static final long FRESH_FOR = 10 * 60_000L;
    private static final String TO_BUY_URL = "/household?seg=buy";

    private static final ExecutorService worker = Executors.newSingleThreadExecutor();

    private KinWidgets() {}

    // reading

    /** From the app (MainActivity), off the main thread. */
    static void refreshSoon(Context context) {
        Context app = context.getApplicationContext();
        if (!any(app)) return;
        worker.execute(() -> refresh(app, false));
    }

    /**
     * Reads api/widget and redraws. Blocking: never on the main thread.
     * `periodic`: the widgets' own update period, skipped if a read is fresh.
     */
    static void refresh(Context context, boolean periodic) {
        if (!any(context)) return;
        SharedPreferences prefs = prefs(context);
        long now = System.currentTimeMillis();
        if (periodic && now - prefs.getLong(READ_AT, 0) < FRESH_FOR) return;
        KinSession.Answer answer = KinSession.get("/api/widget");
        if (answer == null) return;
        if (answer.status == 200 && answer.body != null) {
            prefs.edit().putString(KEY, answer.body).putLong(READ_AT, now).apply();
        } else if (answer.status == KinSession.SIGNED_OUT) {
            prefs.edit().remove(KEY).remove(READ_AT).apply();
        } else {
            return;
        }
        drawAll(context);
    }

    /** No widget left: what was read goes too, rather than sit in the app. */
    static void forgetIfUnused(Context context) {
        if (!any(context)) prefs(context).edit().clear().apply();
    }

    // drawing

    static void drawAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        Snapshot s = Snapshot.load(context);
        long now = System.currentTimeMillis();
        for (int id : ids(context, KinTodayWidget.class)) manager.updateAppWidget(id, today(context, s, now));
        for (int id : ids(context, KinToBuyWidget.class)) manager.updateAppWidget(id, toBuy(context, s));
        scheduleTick(context, s, now);
    }

    static RemoteViews today(Context context, Snapshot s, long now) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.kin_widget_today);
        v.setOnClickPendingIntent(R.id.widget_root, open(context, "/today", 1));
        boolean empty = s == null;
        v.setViewVisibility(R.id.widget_empty, empty ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.widget_dose, empty ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.widget_plan, empty ? View.GONE : View.VISIBLE);
        if (empty) return v;
        // Read on another day: its doses and plans are not today's.
        boolean sameDay = sameDay(s.updatedAt, now);
        JSONObject dose = null;
        JSONObject plan = null;
        if (sameDay) {
            for (int i = 0; i < s.doses.length() && dose == null; i++) {
                JSONObject d = s.doses.optJSONObject(i);
                if (d != null && at(d) + LATE_FOR > now) dose = d;
            }
            for (int i = 0; i < s.plans.length() && plan == null; i++) {
                JSONObject p = s.plans.optJSONObject(i);
                if (p != null && at(p) > now) plan = p;
            }
        }
        block(context, v, dose, now, R.id.widget_dose, R.id.widget_dose_title, R.id.widget_dose_detail, R.string.widget_no_doses, 2);
        block(context, v, plan, now, R.id.widget_plan, R.id.widget_plan_title, R.id.widget_plan_detail, R.string.widget_no_plans, 3);
        return v;
    }

    private static void block(Context context, RemoteViews v, JSONObject item, long now, int box, int title, int detail, int none, int code) {
        if (item == null) {
            v.setTextViewText(title, context.getString(none));
            v.setViewVisibility(detail, View.GONE);
            v.setOnClickPendingIntent(box, open(context, "/today", code));
            return;
        }
        long at = at(item);
        StringBuilder line = new StringBuilder(DateFormat.getTimeFormat(context).format(new Date(at)));
        if (at < now) line.append(" · ").append(context.getString(R.string.widget_late));
        String more = item.optString("detail", "");
        if (!more.isEmpty()) line.append(" · ").append(more);
        v.setTextViewText(title, item.optString("title", ""));
        v.setTextViewText(detail, line.toString());
        v.setViewVisibility(detail, View.VISIBLE);
        v.setOnClickPendingIntent(box, open(context, item.optString("url", "/today"), code));
    }

    static RemoteViews toBuy(Context context, Snapshot s) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.kin_widget_to_buy);
        v.setOnClickPendingIntent(R.id.widget_root, open(context, s == null ? TO_BUY_URL : s.toBuyUrl, 4));
        v.setTextViewText(R.id.widget_count, s == null ? "–" : String.valueOf(s.toBuy));
        v.setTextViewText(R.id.widget_count_label, context.getString(s != null && s.toBuy == 0 ? R.string.widget_all_bought : R.string.widget_on_the_list));
        return v;
    }

    /** Kin at this page; KinAlarms.openIntent keeps it to Kin's own paths. */
    private static PendingIntent open(Context context, String path, int code) {
        return PendingIntent.getActivity(context, 9_000 + code, KinAlarms.openIntent(context, path), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /**
     * Redraws Today when its next dose or plan changes: at each time, as a
     * dose stops being late, and at midnight. Not an exact alarm and not one
     * that wakes the phone: a Home Screen is only seen with the screen on.
     */
    private static void scheduleTick(Context context, Snapshot s, long now) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        if (manager == null) return;
        PendingIntent tick = PendingIntent.getBroadcast(context, 0, new Intent(context, KinTodayWidget.class).setAction(TICK), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        if (ids(context, KinTodayWidget.class).length == 0) {
            manager.cancel(tick);
            return;
        }
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.add(Calendar.DAY_OF_YEAR, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        long next = c.getTimeInMillis();
        if (s != null) {
            for (int i = 0; i < s.doses.length(); i++) {
                long at = at(s.doses.optJSONObject(i));
                if (at > now) next = Math.min(next, at);
                if (at + LATE_FOR > now) next = Math.min(next, at + LATE_FOR);
            }
            for (int i = 0; i < s.plans.length(); i++) {
                long at = at(s.plans.optJSONObject(i));
                if (at > now) next = Math.min(next, at);
            }
        }
        manager.setWindow(AlarmManager.RTC, next, 60_000, tick);
    }

    // the stored snapshot

    static final class Snapshot {
        long updatedAt;
        JSONArray doses;
        JSONArray plans;
        int toBuy;
        String toBuyUrl;

        /** What the app last read; null if nothing (never opened, or signed out). */
        static Snapshot load(Context context) {
            String json = prefs(context).getString(KEY, null);
            if (json == null) return null;
            try {
                JSONObject o = new JSONObject(json);
                Snapshot s = new Snapshot();
                s.updatedAt = KinAlarms.parseAt(o.optString("updatedAt"));
                s.doses = o.optJSONArray("doses") == null ? new JSONArray() : o.optJSONArray("doses");
                s.plans = o.optJSONArray("plans") == null ? new JSONArray() : o.optJSONArray("plans");
                s.toBuy = Math.max(0, o.optInt("toBuy", 0));
                s.toBuyUrl = o.optString("toBuyUrl", TO_BUY_URL);
                return s;
            } catch (Exception e) {
                return null;
            }
        }
    }

    private static long at(JSONObject item) {
        return item == null ? 0 : KinAlarms.parseAt(item.optString("at"));
    }

    private static boolean sameDay(long a, long b) {
        Calendar x = Calendar.getInstance();
        x.setTimeInMillis(a);
        Calendar y = Calendar.getInstance();
        y.setTimeInMillis(b);
        return x.get(Calendar.YEAR) == y.get(Calendar.YEAR) && x.get(Calendar.DAY_OF_YEAR) == y.get(Calendar.DAY_OF_YEAR);
    }

    private static boolean any(Context context) {
        return ids(context, KinTodayWidget.class).length > 0 || ids(context, KinToBuyWidget.class).length > 0;
    }

    private static int[] ids(Context context, Class<?> provider) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, provider));
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
