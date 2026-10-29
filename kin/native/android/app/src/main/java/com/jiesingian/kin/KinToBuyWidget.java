package com.jiesingian.kin;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * The "To-Buy" widget: how many things are on the family's To-Buy list
 * (KinWidgets). Its update period reads api/widget again, as Today's does.
 */
public class KinToBuyWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        KinTodayWidget.update(this, context);
    }

    @Override
    public void onDisabled(Context context) {
        KinWidgets.forgetIfUnused(context);
    }
}
