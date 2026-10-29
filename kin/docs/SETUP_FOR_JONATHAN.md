# Setup that needs Jonathan

Each item here is a secret, an outside account or money, which `CLAUDE.md`
keeps with Jonathan. Everything else is already built and merged; these
steps switch it on. Each says what it is for and what is safe.

**Where things stand (checked 19 October; nothing changed since 29 September):**

| | |
|---|---|
| 1. Reminders | Done: secrets set, `kin-reminders` runs every five minutes |
| 2. Calls on mobile data | To do: free Metered account, steps below |
| 3. Realtime public access off | Done on dev and production |
| 4. Kin AI and flyer scanning | Final stage (costs money), see BACKLOG |
| 5. Payments | Final stage (costs money), see BACKLOG |
| 6. GIFs in the chat | Held for design finalization |
| 7. Sign-up emails through Gmail | Done: sent from familyapp.kin@gmail.com |
| 9. The iPhone app (real alarms, calls, SOS) | Built; waits on the Apple Developer Program, steps below |
| 10–11. The Android app on Google Play | Built and prepared; waits on Firebase (free) and Google Play (US$25 once), steps below |

---

## 1. Reminders at their time (medicines, bills, birthdays, "in 30 minutes")

**What it switches on.** Every five minutes the database's own scheduler
(`pg_cron`, free, part of Supabase) asks Kin what is due and Kin sends the
pushes: a medicine dose at its time, a bill the day before and on the day, a
birthday at 8am, a plan 30 minutes before it starts. Built in
`20260926140000_reminders.sql` and `app/api/cron/reminders`.

**What it needs.** One secret, pasted in two places, plus Kin's address.

**Safe to do.** Nothing is read or changed by these steps except the two
settings themselves. Deleting `kin_cron_url` from Vault stops every reminder
at once; nothing else depends on it.

1. **Make a secret**: 64 random characters. On the Mac, in Terminal:
   `openssl rand -hex 32` -- copy what it prints. (Or any password manager's
   generator, 40+ characters, letters and digits.)
2. **Vercel**: open
   [kin-family-app → Settings → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables).
   Add `CRON_SECRET` = the secret, Environment **Production**, Sensitive on,
   Save.
3. **Redeploy** so the running site reads it:
   [Deployments](https://vercel.com/jisingian/kin-family-app/deployments) →
   the top Production deployment → ⋯ → **Redeploy**.
4. **Supabase, production project**: open
   [Vault → Secrets](https://supabase.com/dashboard/project/_/integrations/vault/secrets)
   (pick the production project when asked) and **Add new secret** twice:
   - name `kin_cron_secret`, value = the same secret as step 2
   - name `kin_cron_url`, value `https://kin-family-app.vercel.app/api/cron/reminders`
5. **Check**: within five minutes, Supabase's
   [Integrations → Cron → Jobs](https://supabase.com/dashboard/project/_/integrations/cron/jobs)
   shows `kin-reminders` running every five minutes with "succeeded".

Each person's reminders follow their own Settings → Notifications switches
(Health, Bills, Events).

---

## 2. Calls on mobile data (a TURN relay)

**What it switches on.** Voice and video calls already work on most Wi-Fi.
On Globe or Smart mobile data the two phones often cannot reach each other
directly: carriers put many phones behind one shared address, so neither
phone can be "called" from outside. A relay is a server both phones can
reach; each connects out to it and it passes the call between them. Kin
hands the phones the relay's details itself, so family members never set
anything up. It is an account Kin holds, like Supabase or Vercel, which is
why it is set up once, here.

**What it costs.** Metered has a free plan with a monthly data allowance
(check the current figure on its Plans & pricing page). The relay is only
used when a direct connection fails, so most calls never touch it. With no
card on file the account cannot charge anything; if the allowance ran out,
calls would simply behave as they do today.

**Safe to do.** A relay only forwards the call's encrypted packets; it cannot
hear or see the call. Deleting the three settings switches it off again.

1. Sign up at [metered.ca/stun-turn](https://www.metered.ca/stun-turn) with
   **familyapp.kin@gmail.com**, and choose the free plan. The workspace can be
   called `kin`.
2. In the [Metered dashboard](https://dashboard.metered.ca/), left menu
   **TURN Server & SFU → Credentials**, then **+ Create Credential**
   (top right). Fill the form like this:

   | Field | Choose | Why |
   |---|---|---|
   | Label | `kin-production` | only a name, so you know what it is for |
   | Region | **Workspace default** | the workspace is *Global (automatic)*: each phone uses the nearest relay, Singapore for the Philippines |
   | Project | **Standalone (no project)** | projects are for splitting usage between customers; Kin is one app |

   Then **Create credential**.
3. The new credential appears in the list with a **Username** and a
   **Password** (Metered also calls it the credential). Click **Show ICE
   Servers Array** next to it. It shows a list like:

       stun:stun.relay.metered.ca:80
       turn:global.relay.metered.ca:80
       turn:global.relay.metered.ca:80?transport=tcp
       turn:global.relay.metered.ca:443
       turns:global.relay.metered.ca:443?transport=tcp

   Use your list if it differs from this one.
4. In [Vercel → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables)
   add three, Environment **Production** only:
   - `TURN_URLS` = every `turn:` and `turns:` line from step 3 (not the
     `stun:` one), joined with commas and no spaces, e.g.
     `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:80?transport=tcp,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp`
   - `TURN_USERNAME` = the Username from step 3
   - `TURN_CREDENTIAL` = the Password from step 3, with **Sensitive** on
5. **Redeploy**: [Deployments](https://vercel.com/jisingian/kin-family-app/deployments)
   → the top Production deployment → ⋯ → **Redeploy**.
6. **Check**: call someone in the family while both phones are on mobile
   data. Metered's **Analytics** page shows the relay being used.

---

## 3. Turn off Realtime's public access (Janine can do this too)

**Done 29 September on dev and production.** Kept for reference.

Not Jonathan-only: the Supabase dashboard is both of yours. Calls and both
chats now use private channels, but Supabase only *enforces* that once public
access is off.

1. Open [Realtime → Settings](https://supabase.com/dashboard/project/_/realtime/settings)
   for the **dev** project, switch **Allow public access** off, Save.
2. Open Kin on the preview and check a chat still updates live when a
   message comes in.
3. Do the same for **production**.

Safe: nothing is deleted; switching it back on undoes it.

---

## 4. Kin AI: Ask Kin, scanning a flyer, and the rest (one key)

**What it switches on.** Everything in Kin that reads with Claude, all on
the one key:

- **Ask Kin** (the sparkle button on every page): questions and additions
  in Taglish or English, and since 20 October the 2 a.m. question -- "Ano
  ang allergy ni Lia?", "Anong gamot ni Lolo?" -- answered for grown-ups
  from Health (`src/lib/assistant/tools.ts`, `get_health`).
- **Planner → Add → *Scan a flyer or invitation***: a photo of a school memo,
  an invite or a poster, read for dates and offered as calendar entries to
  tick (`src/lib/actions/flyer.ts`).
- The Kin Plus features built on the same path (receipt and e-wallet
  scans, the chat summary, Send it to Kin), as each lands.

Until the key exists every one of them is visible and says *Kin AI isn't
switched on yet*; nothing is sent anywhere.

**What it costs.** Every Kin AI call uses **Claude Haiku 5.5**
(`src/lib/kin-ai.ts`, one model name for the whole app; Jonathan, 30
September, 20 and 21 October), at its cheapest thinking level (`low`). At
US$0.10 per million tokens in and US$0.50 out (prompts under 100,000
tokens, which every Kin call is), a question is a few hundredths of a
centavo and a photo scan about US$0.001: roughly a tenth of Haiku 4.5, a
hundredth of Opus. Haiku 5.5 counts the same text as about 30% more tokens
than 4.5 and thinks a little before answering; both are inside those
figures. **Set a monthly spend cap** in the Console (step 3): US$2 a month
is tens of thousands of questions and scans, and when it is reached Kin AI
says it couldn't be reached until the 1st rather than spending more. Kin
Free households are also held to five questions or
scans a month by Kin itself (`use_kin_ai()`); Plus is unlimited.

**Safe to do.** Only the one question, with the records Kin looked up to
answer it, or the one photo being scanned is sent, and nothing is saved
until someone ticks what to add. Every screen that sends family records
says so in one line, and that Kin never trains AI on them. Deleting the
key switches all of it off again.

1. Open the [Claude Console](https://console.anthropic.com/) and sign in (or
   sign up) with the account that should be billed.
2. [Billing](https://console.anthropic.com/settings/billing): add a card and a
   small amount of credit.
3. [Limits](https://console.anthropic.com/settings/limits): set a monthly
   spend limit, e.g. US$2.
4. [API keys](https://console.anthropic.com/settings/keys) → **Create key**,
   name it `kin-ai`, copy it (it is shown once).
5. In [Vercel → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables)
   add `ANTHROPIC_API_KEY` = the key, Environment **Production** (and Preview
   if you want scans on preview links), Sensitive on, Save.
6. **Redeploy** as in 1.3. The flyer card then shows *Take or choose a
   photo*, and Ask Kin answers.

---

## 5. Payments (GCash, Maya, cards)

A decision, not a setting: see `docs/PAYMENTS_OPTIONS.md` for PayMongo and
HitPay side by side, their fees, and what signing up involves.

---

## 6. GIFs in the chat (Chat → + → Sticker or GIF)

**Held for design finalization** (Jonathan, 29 September).

**What it switches on.** The *GIFs* tab in the chat's sticker picker: search
GIPHY and send a GIF, like Messenger. Stickers already work without this.
Until the key below exists the GIFs tab just says "coming soon", and nothing
is sent anywhere. Search is rated **G** because children are in the chat.

**What it costs.** Nothing. GIPHY's API is free. A new key starts as a
*beta* key, which GIPHY limits to about 100 searches an hour across the
whole app. For a family that is usually enough, and if it runs out the picker
says "Too many GIF searches this hour". GIPHY also offers a free
*production* key with a higher limit, which you apply for from the same
dashboard. (I couldn't open GIPHY's site from my session to recheck these
numbers, so check them on the dashboard.)

**Safe to do.** Only the search words go to GIPHY, from Kin's server, never
from anyone's phone. The key is not a password to anything else. Deleting it
switches GIFs off again, and GIFs already sent stay in the thread.

1. Sign up or sign in at [GIPHY for Developers](https://developers.giphy.com/login/).
2. Open the [Dashboard](https://developers.giphy.com/dashboard/) → **Create an
   App** → choose **API** (not SDK), name it `Kin`, describe it as "family chat
   app", and agree to the terms.
3. Copy the **API key** shown for the new app.
4. In [Vercel → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables)
   add `GIPHY_API_KEY` = the key, Environment **Production** (and Preview if
   you want GIFs on preview links), Sensitive on, Save.
5. **Redeploy**: [Deployments](https://vercel.com/jisingian/kin-family-app/deployments)
   → the top one → ⋯ → Redeploy. The GIFs tab then shows trending GIFs and
   a search box.
6. Optional, later: on the same [Dashboard](https://developers.giphy.com/dashboard/)
   choose **Upgrade to Production** on the app if the hourly limit is ever
   hit. GIPHY asks for a screenshot or recording of the GIF picker. The
   picker already shows the "Powered by GIPHY" line they require.

---

## 7. Sign-up emails through Gmail (custom SMTP)

**Done 29 September.** Supabase's built-in sender allows about two emails an
hour and is only meant for testing; a friend's sign-up was refused by it.
Production now sends every sign-in email (verification codes, password
resets) through **familyapp.kin@gmail.com**, which Gmail allows about 500 a
day. New users see it from **Kin <familyapp.kin@gmail.com>**. Confirmed by a
password-reset email sent through it on 29 September.

What is set, so it can be found again:

- [Supabase production → Authentication → SMTP](https://supabase.com/dashboard/project/lffqluudphzviubygwjs/auth/smtp):
  custom SMTP on; host `smtp.gmail.com`, port `465`, username and sender
  `familyapp.kin@gmail.com`, sender name `Kin`, password = a Google **app
  password** made on that account (not its normal password).
- [Rate limits](https://supabase.com/dashboard/project/lffqluudphzviubygwjs/auth/rate-limits):
  100 emails an hour.

If sign-up emails stop arriving, the likely cause is that the app password
was revoked or familyapp.kin's password was changed, which cancels app
passwords. Make a new one at
[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
(signed in as familyapp.kin, 2-Step Verification on), and paste it into the
SMTP page above **without the spaces** Google shows between its four groups.
Switching custom SMTP off returns to Supabase's built-in sender.

Later, for better delivery: a sender on Kin's own domain (e.g. through
Resend) once Kin has one.

## 8. A preview of a pull request, on request

Since 20 October only `main` deploys on its own (`kin/vercel.json`,
`git.deploymentEnabled`). A pull request no longer gets a preview link on
every push: those used up the Hobby plan's 100 deployments a day on 19 and 20
October, and nobody opened them. Merging still updates the live app exactly
as before, a minute or two after the merge.

When you do want to try a pull request on your phone before it merges, ask
for its preview. Each one costs a single deployment.

- **From a Claude session (tried on #755):** say "make a Vercel preview of
  PR #N". The session creates it with the Vercel connector, from the pull
  request's branch, and posts the link.
- **From the Vercel dashboard:** open
  [kin-family-app → Deployments](https://vercel.com/jisingian/kin-family-app/deployments)
  and look for **Create Deployment** (in the **⋯** menu at the top right on
  the dashboards seen so far); give it the pull request's branch name, shown
  at the top of the pull request (e.g. `fix/recipe-link-bad-redirect`).

What's safe: a preview is a separate copy with its own link, built with the
Preview environment variables in Vercel; it never replaces the live site. A
preview that fails shows red on its pull request and automerge waits; fix it
and ask again, or close the pull request.

---

## 9. The iPhone app: real alarms, calls that ring, SOS through silent

**What it's for (29 October).** A web app on an iPhone can't ring through
silent, fill the screen or ring like a phone call. The Kin iPhone app
(`kin/native`) is the same Kin inside an installed app, so all of that
works:
- medicine doses, and the plans, check-ups and bills each person switches on
  (Settings → Notifications → Alarms), ring like the Clock app (AlarmKit,
  iOS 26 and later);
- a Kin call rings with the iPhone's own incoming-call screen (CallKit);
- an SOS comes through Focus, and through silent once Apple grants Critical
  Alerts (step 6).

The code is built and merged, and every change is compiled on GitHub's Mac.
These steps are the only part only you can do. No Mac is needed at any point.

**What it costs.** The Apple Developer Program, US$99 a year. Nothing else.

**What's safe.** The keys below are secrets. Each can be revoked on its page
at any time, and a new one made. Nothing here touches the web app: it keeps
working exactly as now, for everyone, with or without the iPhone app.

1. **Join the Apple Developer Program** at
   [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/).
   Enrol as an **Individual**. A company enrolment needs a D-U-N-S number,
   which needs the business registration first. The app can be moved to the
   company later. Approval takes from a few hours to two days.
2. **Note your Team ID** at
   [developer.apple.com/account](https://developer.apple.com/account), under
   Membership details: 10 letters and numbers.
3. **Register the app's id** at
   [Identifiers → +](https://developer.apple.com/account/resources/identifiers/add/bundleId):
   App IDs → App. Description `Kin`, Bundle ID **Explicit**
   `com.jiesingian.kin`. Tick **Push Notifications**, **Time Sensitive
   Notifications** and **App Groups**, then Register. (App Groups is how the
   Home Screen widgets get Today's next dose from the app. The first
   TestFlight run registers the widgets' own id, `com.jiesingian.kin.widgets`,
   and the group `group.com.jiesingian.kin` by itself. If that run stops on
   "App Group" or "provisioning profile", make the group by hand at
   [Identifiers → + → App Groups](https://developer.apple.com/account/resources/identifiers/add/applicationGroup),
   description `Kin`, identifier `group.com.jiesingian.kin`, and run it again.) Then create the app at
   [App Store Connect → Apps → +](https://appstoreconnect.apple.com/apps) →
   New App: iOS, name `Kin` (or `Kin Family` if Kin is taken), language
   English, that bundle id, SKU `kin`.
4. **Let GitHub build and upload it.**
   - Make an App Store Connect API key at
     [Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api):
     **+**, name `GitHub`, access **Admin**. Admin is needed for Xcode to make
     the signing certificate itself. Download the `.p8` file; Apple lets you
     download it only once. Note the **Key ID** and the **Issuer ID** at the
     top of the page.
   - Add four repository secrets at
     [Settings → Secrets → Actions → New](https://github.com/jiesingian/My-Projects/settings/secrets/actions/new):
     `APPLE_TEAM_ID` (step 2), `ASC_KEY_ID`, `ASC_ISSUER_ID`, and
     `ASC_KEY_P8` (open the `.p8` in a text editor and paste all of it,
     including the BEGIN and END lines).
   - Run [Actions → TestFlight → Run workflow](https://github.com/jiesingian/My-Projects/actions/workflows/testflight.yml).
     About 15 minutes later the build shows in App Store Connect → your app →
     TestFlight. Add yourself and Janine as internal testers there, and
     install it on each iPhone with Apple's TestFlight app.
5. **Let Kin's server reach the app** (calls, SOS and every notification).
   Make a push key at
   [Keys → +](https://developer.apple.com/account/resources/authkeys/add): name
   `Kin push`, tick **Apple Push Notifications service (APNs)**, choose
   **Sandbox & Production**, then Continue → Register, and download the `.p8`.
   In [Vercel → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables)
   add, for Production and Preview: `APNS_KEY_ID` (the key's id),
   `APNS_TEAM_ID` (step 2), and `APNS_PRIVATE_KEY` (the whole `.p8`, BEGIN
   and END lines included). Then redeploy, from the three-dot menu on the
   newest deployment at
   [Deployments](https://vercel.com/jisingian/kin-family-app/deployments).
   Until then, the app's phones are skipped and Web Push carries on as
   before.
6. **Ask Apple for Critical Alerts** (an SOS through the silent switch) at
   [the request form](https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/):
   say Kin is a family safety app whose SOS and medicine reminders must
   reach a parent or carer on silent. Apple answers by email, often after
   some weeks. When it's granted, tell a session: it adds the entitlement to
   the app and `APNS_CRITICAL=1` to Vercel. Until then an SOS is
   time-sensitive: through Focus, but not through silent.

**After the first install, on each iPhone:** open Kin, sign in, allow
notifications and alarms when asked, then try Settings → Notifications →
Alarms, a test call and a test notification. BACKLOG's "Needs a real phone"
list has the checks.


## 10. The Android app's push (Firebase, free)

**What it's for (29 October).** The Kin Android app (`kin/native/android`)
is built on every change and kept as an APK on the run's page
([Actions → Android build](https://github.com/jiesingian/My-Projects/actions/workflows/android.yml)
→ newest run → Artifacts → `kin-android-debug`), for sideloading if someone
in the family gets an Android phone. Its alarms work as they are: full
screen, ringing through silent. **Calls ringing full screen, an SOS and every
other notification** need Google's push (Firebase Cloud Messaging), because
an Android web view can't take Web Push. Firebase needs a project of your
own; a session can't make one. Needed before Google Play (section 11), or
once someone has an Android phone.

**What it costs.** Nothing: Firebase's free plan (Spark) includes Cloud
Messaging without limit. Don't add a card or move to the Blaze plan.

**What's safe.** The service-account key is a secret: it can send Kin's
notifications, nothing else in Kin. Revoke it on the same page at any time
and make another. Nothing here changes the web app or the iPhone app.

1. **Make the project** at
   [console.firebase.google.com → Create a project](https://console.firebase.google.com/).
   Name it `kin-family`. Google Analytics: off. Note the **project ID**
   under the name (often `kin-family`, sometimes with a number added); the
   links below assume `kin-family`, so change that part if yours differs.
2. **Add the Android app** at
   [Project settings → General](https://console.firebase.google.com/project/kin-family/settings/general)
   → Your apps → the Android icon. Package name `com.jiesingian.kin`,
   nickname `Kin`, no SHA-1 needed. Register, then **Download
   google-services.json**. Skip the remaining steps of that page (the code
   is already done).
3. **Let GitHub build it in.** Open the file in a text editor, copy all of
   it, and add a repository secret named `GOOGLE_SERVICES_JSON` at
   [Settings → Secrets → Actions → New](https://github.com/jiesingian/My-Projects/settings/secrets/actions/new).
   The next Android build has push in it (its log says "Push is on in this
   build").
4. **Let Kin's server send.** At
   [Project settings → Service accounts](https://console.firebase.google.com/project/kin-family/settings/serviceaccounts/adminsdk)
   press **Generate new private key** → Generate key. A `.json` file
   downloads. In
   [Vercel → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables)
   add, for Production and Preview: `FCM_PROJECT_ID` (the file's
   `project_id`), `FCM_CLIENT_EMAIL` (its `client_email`) and
   `FCM_PRIVATE_KEY` (its `private_key`, the whole value between the quotes,
   `\n`s included). Then redeploy from the three-dot menu on the newest
   deployment at [Deployments](https://vercel.com/jisingian/kin-family-app/deployments).
   Then delete the downloaded file. Until these exist, Android phones are
   skipped and everything else runs as before.

**On the phone:** install the APK from step 3's next build, open Kin, sign
in, allow notifications, and allow "Alarms & reminders" when asked. Then try
a test call from another phone.


## 11. The Android app on Google Play

**What it's for (29 October).** This publishes the Kin Android app
(`kin/native/android`) on Google Play, so anyone with an Android phone can
install it like any other app. Everything that can be done without you is
done and merged:
- a workflow that builds the signed app and can upload it to Google Play;
- the policy changes Google asks for;
- the account-deletion page;
- the listing text, Data safety answers, content rating, icons and art.

Your part is the accounts, the keys, and pressing the buttons. The answers to
paste are in `kin/native/android/store/`:
- `LISTING.md`, the listing;
- `DATA_SAFETY.md`, the Data safety form;
- `POLICY.md`, the declarations and why.

**What it costs.** US$25 once, for the Google Play developer account (paid
by card at registration, never refunded). Nothing else. Firebase stays on
its free plan.

**How long it takes.** Google makes a new personal account test the app
with **at least 12 people for 14 days in a row** before it may go public.
Allow three weeks from registration to the public listing:
- a few days for Google to check your identity;
- the 14-day test;
- a few days for review.

**What's safe.**
- **The upload key.** It only proves an upload is yours. Google signs what
  it ships to phones with its own key (Play App Signing), so if the upload
  key is ever lost or leaked, Google resets it on request. Keep it private
  all the same.
- **The service account.** It can only upload Kin's releases. Remove it in
  the Play Console at any time.
- **The app itself.** Nothing until "Production" changes anything for anyone
  outside your testers. Nothing here changes the website or the iPhone app.

1. **Firebase first (free).** Do **section 10**, steps 1 to 4. It is what
   makes calls ring, SOS and every notification reach an Android phone.
   Google's reviewers expect more than a website in a frame, and without
   push the app has only its alarms. Done when the
   [Android build](https://github.com/jiesingian/My-Projects/actions/workflows/android.yml)
   log says "Push is on in this build".
2. **Register as a Google Play developer (US$25).**
   - Open [play.google.com/console/signup](https://play.google.com/console/signup)
     with the Google account that should own Kin. `familyapp.kin@gmail.com`
     keeps it beside Kin's email.
   - Choose **Yourself** (a personal account). An organisation account needs
     a D-U-N-S number, which needs the business registration first. The app
     can be moved to an organisation account later.
   - Pay the US$25. Verify your identity with a government ID.
   - Verify your phone number, and your Android phone, through the **Play
     Console app** Google asks you to install.
   - Google emails when you are verified, usually within a few days.
3. **Create the app.**
   - At [play.google.com/console](https://play.google.com/console), press
     **Create app**.
   - App name `Kin: Family Organizer`, default language English (United
     States), **App**, **Free**. Tick the two declarations, then **Create
     app**.
   - The package name, `com.jiesingian.kin`, is fixed by the first upload
     (step 5), and can never change after it.
4. **Make the upload key and give it to GitHub** (once; about 10 minutes).
   - Open [Google Cloud Shell](https://shell.cloud.google.com/?show=terminal),
     a free terminal in the browser with Java already installed. Sign in with
     the same Google account. Paste:
     ```
     keytool -genkeypair -v -keystore kin-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12 -dname "CN=Kin, O=Kin, C=PH"
     ```
   - It asks for a password twice. Make a long one and save it in your
     password manager **now**, as "Kin Android upload key".
   - Then paste:
     ```
     base64 -w 0 kin-upload.jks > kin-upload.b64 && cloudshell download kin-upload.jks && cat kin-upload.b64
     ```
     - Your browser downloads `kin-upload.jks`. Keep that file with the
       password: in the password manager as an attachment, or in a private
       folder.
     - The terminal prints one long line: that is the key as text, for
       GitHub.
   - Add four repository secrets at
     [Settings → Secrets → Actions → New](https://github.com/jiesingian/My-Projects/settings/secrets/actions/new),
     one at a time:
     - `ANDROID_UPLOAD_KEYSTORE_B64`: the long line, all of it;
     - `ANDROID_UPLOAD_KEYSTORE_PASSWORD`: the password;
     - `ANDROID_UPLOAD_KEY_ALIAS`: `upload`;
     - `ANDROID_UPLOAD_KEY_PASSWORD`: the same password. With that command
       the key and the store share one.
   - Back in Cloud Shell, clean up: `rm kin-upload.jks kin-upload.b64`.
5. **Build the app and upload the first one by hand.** Google allows only
   the first upload of a new app by hand.
   - Run [Actions → Google Play release → Run workflow](https://github.com/jiesingian/My-Projects/actions/workflows/play-release.yml)
     (leave the box ticked). About 10 minutes later, open the run and
     download the artifact **kin-android-aab**. It is a zip; inside is
     `app-release.aab`.
   - In the Play Console, open your app → **Test and release → Testing →
     Internal testing** → **Create new release**.
   - Google offers **Play App Signing** with a key Google generates: accept
     it (the default).
   - Upload `app-release.aab`. Release name: leave Google's. Release notes:
     "First test build." Then **Next → Save and publish**.
   - **Testers** tab: create an email list, "Kin family", with your and
     Janine's Google account emails. Copy the **join link**, open it on your
     Android phone, accept, and install Kin from Google Play.
6. **Let GitHub upload the next ones itself** (optional; saves step 5's
   download and upload each time).
   - Turn on the Google Play Android Developer API for the Firebase project
     at
     [this page](https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com?project=kin-family)
     → **Enable**. (Change `kin-family` in the link if your Firebase project
     ID differs, as in section 10.)
   - Make a service account at
     [Service accounts → Create](https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=kin-family):
     name `play-upload`, then **Done**, with no roles.
   - Open it from the
     [list](https://console.cloud.google.com/iam-admin/serviceaccounts?project=kin-family)
     → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
   - In the Play Console, open **Users and permissions** from the left-hand
     menu of
     [play.google.com/console](https://play.google.com/console) → **Invite
     new users**. Enter the service account's email (in the file, as
     `client_email`). Under **App permissions** add Kin, tick **Release to
     testing tracks** and **Release apps to production**. **Invite user**.
   - Add a repository secret `PLAY_SERVICE_ACCOUNT_JSON` at
     [Settings → Secrets → Actions → New](https://github.com/jiesingian/My-Projects/settings/secrets/actions/new):
     the whole file's contents. Then delete the downloaded file.
   - From now on,
     [Run workflow](https://github.com/jiesingian/My-Projects/actions/workflows/play-release.yml)
     builds a new version and puts it on internal testing by itself. Testers
     get it as an update.
7. **Fill in the store pages** (about an hour; the answers are written out).
   In the Play Console, the app's **Dashboard** lists each task.
   - **Main store listing:** paste from `store/LISTING.md`. Upload
     `store/icon-512.png`, `store/feature-graphic.png` and the phone
     screenshots in `store/screenshots/`. If that folder is empty, ask a
     session to run `store/screenshots.mjs`. It takes them from the QA
     household on dev, never a real family.
   - **Store settings:** category Lifestyle, and your contact email.
   - **App content:** each line of `LISTING.md`'s table:
     - privacy policy;
     - ads: none;
     - app access;
     - content rating: the IARC answers;
     - target audience: 18 and over;
     - Data safety: `store/DATA_SAFETY.md`;
     - financial features;
     - health apps;
     - full-screen intent.
   - **App access** needs the reviewers' sample household. Make it as
     `LISTING.md` says, under "App access: the review login": made-up people
     on production, under `familyapp.kin+review@gmail.com`.
   - **Account deletion:** the delete account URL is
     `https://kin-family-app.vercel.app/legal/delete-account`. It sends people
     who can't sign in to your contact email. Tell a session which email to
     put in `OPERATOR.email` (`lib/legal.ts`) to show it there directly.
8. **The 14-day closed test (Google's rule for new personal accounts).**
   - Open **Testing → Closed testing** → **Create track**, or use "Alpha".
   - **Promote** the internal release to it: Internal testing → the
     release's menu → Promote release → Closed testing.
   - Under **Testers**, make an email list of **at least 12 people** with
     Android phones: family and friends. Each opens the join link on their
     phone, accepts, and installs Kin. They must **stay opted in for 14 days
     in a row**, and using Kin now and then helps: Google checks the test
     was real.
   - Google's rule:
     [support.google.com/googleplay/android-developer/answer/14151465](https://support.google.com/googleplay/android-developer/answer/14151465).
9. **Production.**
   - After the 14 days, the Dashboard offers **Apply for production**.
     Answer its questions about the test honestly (who tested, what changed).
     Google answers within about a week.
   - Then **Production → Create new release → Add from library** (the
     tested build).
   - **Countries:** Philippines, and any others you want. **Review release
     → Start rollout to Production**.
   - Google reviews it (a few days for a first app) and emails the result. A
     rejection names the policy. Paste it to a session: the answers are in
     `store/POLICY.md`.

**After the first install, on an Android phone:** BACKLOG's "Needs a real
phone" has the Android checks: alarms, calls, the re-sync, and the full
screen being taken away.

