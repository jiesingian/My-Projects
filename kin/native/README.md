# Kin for iPhone and Android (native shell)

Jonathan, 29 October: every Kin feature that needs an alarm must work
permanently, on silent too, which a web app on an iPhone cannot do. Kin is
therefore wrapped as an installed app. The decisions:

- **Wrap the web app, don't rewrite it.** This is a Capacitor shell that loads
  `https://kin-family-app.vercel.app` (see `capacitor.config.json`). Every
  screen stays the web app's, so a fix to the web app reaches the iPhone app
  at once. Native code is only for what only an installed app can do.
- **Real alarms for:** medicine doses; plans, check-ups and bills (off by
  default, switched on per item); SOS and incoming calls. Birthdays and
  occasions stay ordinary notifications.
- **No Mac.** GitHub's macOS runner builds it (`.github/workflows/ios.yml`).
  Until the Apple Developer Program is paid for, that build is unsigned and
  for the simulator, which proves the Swift compiles. Signing and TestFlight
  are added when the account exists (`kin/docs/SETUP_FOR_JONATHAN.md`).

## Layout

- `capacitor.config.json`: app id `com.jiesingian.kin` (it can change until
  the first upload to App Store Connect, never after), the live URL, and
  app-bound domains (needed for the web app's service worker inside the shell),
  and `KinApp/iOS` added to the web view's user agent, so the web app knows
  it is inside the iPhone app (no purchase links there; App Review 3.1.1).
- `ios/App`: the Xcode project, made by `npx cap add ios` and committed.
  `npx cap sync ios` (CI runs it) copies the config in. Swift Package Manager,
  no CocoaPods.
- `www/`: the page shown only if the live site cannot load the first time.
- `ios/store/`: the App Store listing, review notes, privacy and age-rating
  answers, and the screenshot script, ready to paste into App Store Connect.

## What the native code does

- `KinAlarmsPlugin.swift`: the page hands it the next two weeks of alarms
  (`api/alarms`, `lib/alarms.ts`) each time Kin opens. On iOS 26 and later
  they're AlarmKit alarms; on older iPhones, time-sensitive notifications.
  `KinAlarmSync` (same file) keeps them topped up without Kin being opened:
  a silent push (`apns-push-type: background`) once a day and after a change
  wakes the app, which asks `api/alarms` with the web view's own session
  cookies and sets the list again (`AppDelegate.swift`). A phone where Kin was
  swiped away in the app switcher gets no silent push until Kin is next
  opened; that is Apple's rule.
- `KinPushPlugin.swift`:
  - `KinCalls` is set up at launch. It holds the two Apple tokens (alert and
    VoIP), which the page saves (`components/native-push.tsx`).
  - It hands a VoIP ring to CallKit, and opens a tapped notification's page.
  - The server side is `lib/apns.ts`.
- `KinWidgetStore.swift`: `KinSession`, a request to Kin as the member with
  the web view's own cookies (used by the alarm sync and the widgets), and
  `KinWidgetStore`, which leaves `api/widget`'s answer in the App Group.
- `KinWidgets/`: the WidgetKit extension (Today: next dose and next plan;
  To-Buy: the count), reading only the App Group. A tap opens
  `kin://open?path=...`, handled in `SceneDelegate.swift`.
- `KinBridgeViewController.swift`: registers both plugins with Capacitor.
- `App.entitlements`: push, Time Sensitive, and the App Group shared with
  the widgets. Critical Alerts are added
  once Apple grants them.
- `ExportOptions.plist`: for the TestFlight upload (`.github/workflows/testflight.yml`).
  `ios/TESTFLIGHT.md`: what the first run does and what each failure means.
- `PrivacyInfo.xcprivacy` (app and widgets): Apple's privacy manifest, the
  App Group `UserDefaults` reason. `Info.plist` says Kin uses no non-exempt
  encryption (so builds skip the export question) and why each background
  mode is there. iPhone only (`TARGETED_DEVICE_FAMILY = 1`): no iPad
  screenshots or iPad review; it can be widened later, never narrowed.

## Android (built, not published)

`android/` is the same shell for Android, made by `npx cap add android` and
committed (Java, package `com.jiesingian.kin`). `.github/workflows/android.yml`
builds a debug APK on every change here and keeps it as the run's artifact,
and checks the release bundle builds. `.github/workflows/play-release.yml`,
started by hand, builds the signed AAB for Google Play and can upload it to
internal testing (`scripts/play-upload.mjs`).
- `KinAlarms.java`, `KinAlarmsPlugin.java`, `KinAlarmReceiver.java`,
  `KinAlarmActivity.java`: exact alarms that open full screen over the lock
  screen and ring on the alarm stream; set again after a restart.
- `KinMessagingService.java`, `KinPushPlugin.java`,
  `KinCallDeclineReceiver.java`: push through Firebase (`lib/fcm.ts`), a call
  as Android's full-screen incoming-call notification. Off until Kin has a
  Firebase project (`kin/docs/SETUP_FOR_JONATHAN.md`, section 10).
- `MainActivity.java`: registers the plugins, and opens a page an alarm,
  notification or answered call asks for.
- `store/`: what Google Play asks for, ready to paste:
  - `LISTING.md`: the listing text, the content rating and app access;
  - `DATA_SAFETY.md`: the Data safety answers;
  - `POLICY.md`: the policy declarations;
  - the icon and the feature graphic (`make-art.mjs`, which also makes the
    launcher icons);
  - `screenshots.mjs`, which takes the screenshots from the QA household.

## Working on it

From `kin/native`: `npm ci`, then `npx cap sync ios`. Without a Mac, push and
let the iOS build check compile it. The iOS build check runs only for
changes here.
