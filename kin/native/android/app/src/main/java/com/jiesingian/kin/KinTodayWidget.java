package com.jiesingian.kin;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The "Today" widget: the next dose and the next plan (KinWidgets). Its
 * update period (30 minutes, res/xml/kin_widget_today.xml) reads api/widget
 * again; TICK only redraws, as the next dose or plan comes round.
 */
public class KinTodayWidget extends AppWidgetProvider {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (KinWidgets.TICK.equals(intent.getAction())) KinWidgets.drawAll(context);
        else super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        update(this, context);
    }

    @Override
    public void onDisabled(Context context) {
        // The last Today widget gone: its TICK alarm goes too.
        KinWidgets.drawAll(context);
        KinWidgets.forgetIfUnused(context);
    }

    /** Draws what is stored at once, then reads again in the background. */
    static void update(BroadcastReceiver receiver, Context context) {
        KinWidgets.drawAll(context);
        Context app = context.getApplicationContext();
        PendingResult pending = receiver.goAsync();
        new Thread(() -> {
            try {
                KinWidgets.refresh(app, true);
            } finally {
                pending.finish();
            }
        }, "kin-widget").start();
    }
}
