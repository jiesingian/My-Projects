# The first TestFlight run: what happens, and what each failure means

[Actions → TestFlight → Run workflow](https://github.com/jiesingian/My-Projects/actions/workflows/testflight.yml)
(`.github/workflows/testflight.yml`). It needs SETUP_FOR_JONATHAN.md §9
steps 1 to 5 done first. About 15 minutes of runner time, then 10 to 30
minutes of Apple processing before the build shows in TestFlight.

Nothing here can harm the web app or anyone's data: the run builds and
uploads a file, and a failed run leaves nothing behind but a log. Running
it again is always safe; each run is a new build number
(`github.run_number`).

## The steps, in order

| Step | What it does | Done when the log says |
|---|---|---|
| The secrets are there | Stops at once, naming any of the four secrets that is missing | (nothing; it passes silently) |
| `npm ci`, `npx cap sync ios` | Installs Capacitor, copies `capacitor.config.json` into the Xcode project | `Sync finished` |
| The API key | Writes the `.p8` to the runner's temp folder (deleted at the end) | (silent) |
| Archive | Builds Release for a real iPhone and signs the app and the widget extension. Xcode makes the certificate and both profiles itself (`-allowProvisioningUpdates`) | `** ARCHIVE SUCCEEDED **` |
| What was signed | Prints each target's bundle id, team and entitlements from the archive. Stops only if the widget extension is missing; a missing App Group or wrong team is a yellow warning | both `com.jiesingian.kin` and `com.jiesingian.kin.widgets`, each with `group.com.jiesingian.kin`; the app also with `aps-environment` and `production` |
| Sign for the App Store and upload | Re-signs for distribution and uploads to App Store Connect | `** EXPORT SUCCEEDED **` and `Uploaded build N` |

## Likely failures, and what to do

Read the first `error:` line in the Archive or Upload step.

| The log says | What it means | What to do |
|---|---|---|
| `Missing secrets in main-only: ...` | A secret was not added, its name is misspelt, or it was added as a repository secret | Add it to the `main-only` environment at [Settings → Environments → main-only](https://github.com/jiesingian/My-Projects/settings/environments), exact name as listed, then Run again |
| `No Account for Team "..."` or `Unable to authenticate` | The API key is wrong: a mismatched Key ID or Issuer ID, or the `.p8` pasted without its BEGIN/END lines | Check the three key secrets against [the API keys page](https://appstoreconnect.apple.com/access/integrations/api) |
| `Cloud signing permission error` or `You do not have required contracts / permission to perform this operation` | The key is not **Admin**, or the account has not accepted the latest Program License Agreement | Make a new key with **Admin** access, or accept the agreement on [developer.apple.com/account](https://developer.apple.com/account) (a banner shows it), then Run again |
| `No profiles for 'com.jiesingian.kin' were found` | The App ID is not registered yet, or Xcode could not register it | Do §9 step 3, then Run again |
| `... doesn't support the App Groups capability` or `... group.com.jiesingian.kin ...` | The App ID lacks App Groups, or the group does not exist | Tick App Groups on the App ID; make the group (§9 step 3); Run again |
| `Provisioning profile ... doesn't include the ... Time Sensitive Notifications` | The App ID lacks Time Sensitive Notifications | Tick it on [the App ID](https://developer.apple.com/account/resources/identifiers/list), Save, Run again |
| `... critical-alerts ...` | The Critical Alerts entitlement was added before Apple granted it | It must not be in `App.entitlements` until the grant email comes (§9 step 12) |
| `You have already reached the maximum allowed number of certificates` | Each fresh runner makes a new signing certificate, and Apple caps them | Revoke the older ones named "Created via API" at [Certificates](https://developer.apple.com/account/resources/certificates/list) (revoking stops nothing already on the App Store or in TestFlight), then Run again |
| `No suitable application records were found` (upload) | The app record is not created in App Store Connect yet | Do §9 step 4, then Run again |
| `The bundle version must be higher than the previously uploaded version` | A build number was reused (a re-run of the same run) | Start a new run rather than re-running the old one |
| `ITMS-91053: Missing API declaration` (email from Apple after upload) | A required-reason API is used without a reason in `PrivacyInfo.xcprivacy` | Tell a session the API name from the email; it adds the reason |
| `ITMS-90683: Missing purpose string` (email) | An Info.plist usage text is missing for a permission | Tell a session the key named in the email |
| Upload succeeded, but the build never shows in TestFlight | Apple's processing rejected it; the reason comes by email to the account holder | The email names the problem; tell a session |

Anything else: copy the 20 lines above the first `error:` to a session.

## After it shows in TestFlight

- **Test Information:** App Store Connect → the app → TestFlight → Test
  Information needs a feedback email and, for external testers only, a
  beta description. Internal testers need nothing more.
- **Internal testers:** TestFlight → Internal Testing → + → add yourself
  and Janine (each must first be a user at
  [Users and Access](https://appstoreconnect.apple.com/access/users)). Each
  installs Apple's TestFlight app and taps Install.
- **The first build is reviewed only for external testing.** Internal
  testers can install at once.

## What only a real iPhone can tell (BACKLOG, "Needs a real phone")

These cannot be checked from GitHub's Mac or a simulator, so nobody has
checked them yet:
- A dose alarm rings full screen through the silent switch (iOS 26), and
  as a time-sensitive notification on iOS 17 to 18.
- A Kin call rings with the incoming-call screen with Kin closed;
  answering opens the call and the sound works, also with the screen
  locked (the `audio` background mode); declining stops the caller's ring.
- A call the caller hangs up before it is answered: the iPhone should stop
  ringing within a few seconds (the missed-call push ends the CallKit ring,
  `endsCall`), with no second incoming call flashing up, and "Missed call"
  should show. Needs the APNs key (§9 step 7).
- The widgets show Today's next dose and plan and the To-Buy count after
  Kin has been opened once, and are emptied after signing out.
- The silent daily push re-sets the alarms without opening Kin (needs the
  APNs key in Vercel, §9 step 7).
- An SOS arrives through Focus.
- The App Store review build has no price, "See plans" link or Kin code
  anywhere (Today, Settings → Your plan, a Plus area, onboarding).
