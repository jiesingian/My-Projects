# Kin on Google Play: the policy questions, answered

Checked against Google Play's policies and Play Console Help on 29 October
2026. Google changes these, so check the linked pages again before
submitting. Each section says what Kin does, what Jonathan declares in the
Play Console, and the text to paste.

Where the Play Console asks these questions: **App content**, at
`https://play.google.com/console/u/0/developers/<developer id>/app/<app id>/app-content/overview`.
That address appears once the app exists; SETUP_FOR_JONATHAN.md §11 opens it
from the app's dashboard.

## Target API level

- `targetSdkVersion 36` (Android 16) in `android/variables.gradle`.
- Google Play has required API 36 for new apps and for updates since
  31 August 2026: https://developer.android.com/google/play/requirements/target-sdk
- The next rise is likely around August 2027 (API 37). The Play Console warns
  months ahead.

## Exact alarms: `SCHEDULE_EXACT_ALARM`, not `USE_EXACT_ALARM`

- **Changed (this PR):** Play allows `USE_EXACT_ALARM` only when an app's
  *core* function is an alarm clock or a calendar. Kin is a family
  organiser, with medicine doses and chosen plans, check-ups and bills that
  ring as alarms. A reviewer could reasonably refuse it, and a refusal blocks
  the release.
- So Kin asks for `SCHEDULE_EXACT_ALARM`, which needs **no Play
  declaration**.
  - On Android 14 and later it is off on a new install, and the person turns
    it on.
  - Settings → Notifications → Alarms has a button that opens Android's
    "Alarms & reminders" page for Kin (`KinAlarmsPlugin.authorize`).
  - Once it is allowed, `KinAlarmReceiver` sets the stored alarms at once
    (`SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`).
  - Until then the page says alarms are off. Kin's ordinary notifications
    still arrive.
- https://developer.android.com/about/versions/14/changes/schedule-exact-alarms

## Full-screen notifications: `USE_FULL_SCREEN_INTENT`

- Kin uses it for **incoming calls**, Android's own CallStyle call screen
  (`KinMessagingService`).
- It also uses it for **alarms** (`KinAlarmReceiver` → `KinAlarmActivity`,
  ringing on the alarm stream).
- These are exactly the two uses Play allows. **Declare it** under App content
  → Full-screen intent permission.
  - Choose: *"Calling"* and *"Alarm"*. Pick both if the form allows it, or
    *Calling* if only one may be chosen.
  - Text to paste: "Kin's family calls ring with Android's incoming-call
    screen over the lock screen, so a family member can answer a voice or
    video call. Medicine doses, and the plans and bills a member chooses, ring
    like an alarm clock, full screen over the lock screen, until stopped."
- **If Google or the person takes it away** (Android 14+):
  - Alarms and calls still ring, as heads-up notifications, with the alarm or
    ringtone sound.
  - `canUseFullScreenIntent()` is false, and Settings → Notifications → Alarms
    says so. Its "Allow full screen" button opens Android's page for it
    (`ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`).
- https://developer.android.com/about/versions/14/behavior-changes-14#fsi-limits
- https://support.google.com/googleplay/android-developer/answer/13392821

## Other permissions (no declaration form; asked at run time)

| Permission | Why |
|---|---|
| `POST_NOTIFICATIONS` | Kin's notifications, alarms and calls. Asked the first time a member taps "Allow Kin to set alarms" or turns on notifications. |
| `CAMERA`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Family voice and video calls (WebRTC in the page), and taking a photo for a receipt or a record. Asked the first time a call or photo needs it. |
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | Only when the person presses SOS or "I've arrived", or turns on sharing on the family's places. Only while Kin is open. **Never background location**, so no location declaration is needed. |
| `RECEIVE_BOOT_COMPLETED` | Setting the alarms again after the phone restarts or Kin is updated. |
| `VIBRATE`, `WAKE_LOCK` | The alarm screen. |
| `INTERNET` | Kin itself. |

**Foreground services:** none. CallStyle needs either a foreground service or
a full-screen intent; Kin uses the full-screen intent, so there is no
`FOREGROUND_SERVICE_*` permission and no foreground-service declaration.

## Health apps declaration

- **Every** app must fill in App content → Health apps, even to say it has no
  health features. https://support.google.com/googleplay/android-developer/answer/14738291
- Kin keeps the household's medicines and doses, health records and
  check-ups, so tick:
  - **Medication management** (reminders, and keeping track of doses);
  - *Health records* / personal health information, if offered as an option.
- Untick everything else: no diagnosis, no clinical decisions, no
  Health Connect, no sensors, no human-subjects research.
- The privacy policy covers health data ("Health records" in
  `/legal/privacy`).

## "Webview apps" and minimum functionality

- Play removes apps that only wrap a website. Kin is the live web app inside
  Capacitor, plus things only an installed Android app can do:
  - **real alarms**: exact, full screen over the lock screen, on the alarm
    stream through silent (`KinAlarms*.java`);
  - **calls that ring** like a phone call, with Android's own incoming-call
    screen and Decline (`KinMessagingService`, `KinCallDeclineReceiver`);
  - **push** for SOS, on its own channel through Do Not Disturb, and every
    other notification (Firebase).
- Say this in the full description and in "App access" notes
  (`store/LISTING.md`).
- **Before submitting, push must be on**, with `GOOGLE_SERVICES_JSON` and the
  `FCM_*` keys (SETUP §10). Without push, the native part is alarms alone.

## Account deletion

- Play requires both an **in-app path** and a **web link** where a person can
  ask for deletion without the app:
  https://support.google.com/googleplay/android-developer/answer/13327111
- **In the app:** Settings → Account → Delete my account (`/settings/account`;
  7 days' grace, then the account is removed).
- **Web link:** `https://kin-family-app.vercel.app/legal/delete-account`
  (added in this series). It says how to delete from any browser and what is
  deleted or kept, with a way to ask if you can't sign in.
- Enter the link in App content → Data safety → "Delete account URL".

## Target audience and the Families policy

- Target age group: **18 and over** only. Kin is for running a household:
  money, bills, medicines, documents.
  - Children appear only as profiles a parent manages.
  - A child can sign in only after a parent approves it in the household.
  - Children are not the audience, so the Families policy does not apply.
    https://support.google.com/googleplay/android-developer/answer/9867159
- Asked "Could the app unintentionally appeal to children?": **No**. The
  store art and text are for parents, with no cartoon characters or games
  aimed at children.
- Be honest in Data safety that the app can hold information **about**
  children, which their parent enters. (Data safety has no separate
  question for it; the privacy policy's "Children" section covers it.)

## Payments: Kin Plus

- Kin Plus is a digital subscription. On Google Play, an app that sells
  digital goods **inside the app** must use Google Play Billing.
- In the Philippines no alternative-billing or external-offers programme
  exists yet: as of October 2026, those cover the US, the EEA, the UK and a
  few others.
  - https://support.google.com/googleplay/android-developer/answer/10281818
  - https://support.google.com/googleplay/android-developer/answer/13821247
- Kin sells Plus only on the website. The Android app is "consumption only": a
  household that has Plus gets it in the app.
- Inside the Android app Kin shows **no prices, no "buy" or "upgrade"
  button, and no link to the web checkout**. A Kin code can still be entered:
  redeeming a code is allowed. (`inAndroidApp()`, added in this series.)
- Re-check when GCash/Maya payments go live on the website, and if Google
  opens alternative billing to the Philippines.

## Developer account rules that shape the walkthrough

- **Personal accounts** (Jonathan's) made after November 2023 must run a
  **closed test with at least 12 testers, opted in for 14 days in a row**,
  before they may apply for production. Internal testing does not count.
  https://support.google.com/googleplay/android-developer/answer/14151465
- **Identity verification:**
  - a government ID;
  - a phone number;
  - an Android phone with the Play Console app, for device verification.

  Allow a few days.
- **Android developer verification** (2026–27): Google is registering
  developers and package names. For an app on Google Play this happens on its
  own when the app is created in the Play Console, so there is nothing extra to
  do. https://developer.android.com/developer-verification
