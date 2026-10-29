# Kin for iPhone (native shell)

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
  app-bound domains (needed for the web app's service worker inside the shell).
- `ios/App`: the Xcode project, made by `npx cap add ios` and committed.
  `npx cap sync ios` (CI runs it) copies the config in. Swift Package Manager,
  no CocoaPods.
- `www/`: the page shown only if the live site cannot load the first time.

## Working on it

From `kin/native`: `npm ci`, then `npx cap sync ios`. Without a Mac, push and
let the iOS build check compile it. The iOS build check runs only for
changes here.
