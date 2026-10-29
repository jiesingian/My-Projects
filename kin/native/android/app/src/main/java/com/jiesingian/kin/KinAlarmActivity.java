package com.jiesingian.kin;

import android.app.Activity;
import android.app.NotificationManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The full-screen Kin alarm, over the lock screen, ringing on the alarm
 * stream (through silent, like the Clock app) until Stop or Open, or for a
 * minute at most -- Kin's own dose reminders take over from there.
 */
public class KinAlarmActivity extends Activity {
    private Ringtone ringtone;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String title = getIntent().getStringExtra("title");
        String body = getIntent().getStringExtra("body");
        String url = getIntent().getStringExtra("url");
        int code = getIntent().getIntExtra("code", 0);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(48, 48, 48, 48);
        root.setBackgroundColor(Color.rgb(214, 58, 85));

        TextView t = new TextView(this);
        t.setText(title == null ? "Kin" : title);
        t.setTextColor(Color.WHITE);
        t.setTextSize(30);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        root.addView(t);

        if (body != null && !body.isEmpty()) {
            TextView b = new TextView(this);
            b.setText(body);
            b.setTextColor(Color.WHITE);
            b.setTextSize(20);
            b.setGravity(Gravity.CENTER);
            b.setPadding(0, 24, 0, 48);
            root.addView(b);
        }

        Button stop = new Button(this);
        stop.setText("Stop");
        stop.setTextSize(22);
        stop.setOnClickListener(v -> finishAlarm(code, null));
        root.addView(stop, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 180));

        Button open = new Button(this);
        open.setText("Open in Kin");
        open.setTextSize(18);
        open.setOnClickListener(v -> finishAlarm(code, url));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 160);
        lp.topMargin = 24;
        root.addView(open, lp);

        setContentView(root);

        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        ringtone = RingtoneManager.getRingtone(this, sound);
        if (ringtone != null) {
            ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
            ringtone.play();
        }
        handler.postDelayed(() -> finishAlarm(code, null), 60_000);
    }

    private void finishAlarm(int code, String url) {
        handler.removeCallbacksAndMessages(null);
        if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(code);
        if (url != null) startActivity(KinAlarms.openIntent(this, url));
        finish();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (ringtone != null && ringtone.isPlaying()) ringtone.stop();
        super.onDestroy();
    }
}
