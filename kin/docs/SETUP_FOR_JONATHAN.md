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
| 9. The ready-made "Kin Alarms" Shortcut | To do: build it once on your iPhone, steps below |

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

## 9. The ready-made "Kin Alarms" Shortcut (once, on your iPhone)

**What it switches on.** Settings → Notifications → Medicine alarms
([open it](https://kin-family-app.vercel.app/settings/notifications/alarms))
turns a person's dose times into iPhone Clock alarms, which ring full screen
even on silent. Today each person has to build the Shortcut themselves from
the steps under "Build it by hand", which is what you found too hard on 26
October. If you build it once and share it, the screen gets an **Add the
Kin Alarms Shortcut** button: a person taps it, pastes their private link
into the one question the Shortcut asks, and is done. Until then the screen
says "The ready-made Shortcut is coming; your link is ready for it."

**Why it needs you.** A Shortcut can only be made in the Shortcuts app on an
Apple device; no session can build or share one. About 15 minutes.

**Safe to do.** The Shortcut only reads the link it is given and only
touches alarms whose label starts with `Kin ·`, so your other alarms are
left alone. **Don't leave your own private link in it when you share it**:
step 2 puts a placeholder there, and the Import Question asks each person
for theirs. If anything goes wrong, delete the Shortcut (long-press it →
Delete) and start again; nothing in Kin changes. Your half-built "Kin
Alarms" from 26 October can be deleted the same way first.

**A note on names.** I wrote these from the Shortcuts app as I know it; I
couldn't open an iPhone from the session, so a name may differ a little on
iOS 26. Where I'm unsure I say so. If an action isn't there under the name
given, type a word of it (e.g. "alarm") in the search field at the bottom
of the action list.

1. **Start.** Open Shortcuts ([shortcuts://create-shortcut](shortcuts://create-shortcut)
   opens a new one when tapped on the iPhone, e.g. from Notes). Tap the name
   at the top → **Rename** → `Kin Alarms`.
2. **The link's field (this is what the Import Question will ask for).** Add
   **Text** and type `Paste your Kin link here`. Don't paste your real link.
3. **Read it.** Add **Get Contents of URL**. It should fill in **Text** from
   step 2 by itself; if not, tap its URL field and choose **Text**.
4. **Is the read good?** Add **Get Dictionary Value**. Set it to **Get
   Value for** `status` **in Contents of URL**.
5. **The If (the step that went wrong last time).** Add **If**. It picks up
   **Dictionary Value** by itself, but Shortcuts may guess it is a file and
   show **If File Size is … MB**, which later fails with "couldn't convert
   from Text to Dictionary". To fix it: tap the blue **Dictionary Value**
   inside the If and choose **Text** from the list of types (it may be
   under a "Type" heading). The If should then read **If Text is** —
   tap the condition and pick **is**, then type `ok`. Leave the **Otherwise**
   part empty. Steps 6 to 9 all go *between* **If** and **Otherwise**: drag
   each one up into that gap after adding it.
6. **Clear the old Kin alarms.** Add **Find Alarms** and add a filter
   **Label** **begins with** `Kin ·` (with a middle dot: copy `Kin ·` from
   the first paragraph of the Medicine alarms screen, which shows "Kin ·
   Losartan 50 mg"). Then add **Delete Alarm**, which uses the found
   alarms. *Unsure:* I'm not certain iOS 26 has **Find Alarms** and **Delete
   Alarm** under those names; the nearest I know are **Get All Alarms** and
   **Toggle Alarm**. If **Delete Alarm** isn't there, use **Toggle Alarm**
   set to **Turn Off**, and tell the session which you used.
7. **The list of doses.** Add **Get Dictionary Value**: **Get Value for**
   `alarms` **in Contents of URL** (tap the input and choose **Contents of
   URL**, not Dictionary Value). Then add **Repeat with Each**, which takes
   that **Dictionary Value**.
8. **Inside the Repeat** (between **Repeat with Each** and **End Repeat**):
   add **Get Dictionary Value**, **Get Value for** `time` **in Repeat
   Item**; then another, `label` in **Repeat Item**.
9. Still inside the Repeat: add **Create Alarm** (the Clock app's). Time:
   the `time` Dictionary Value from step 8; Label: the `label` Dictionary
   Value; repeat: every day. *Unsure* of the exact wording of its fields on
   iOS 26; if the time field won't take the variable, tap it and choose
   **Dictionary Value** under "Select Variable".
10. **After End If** (at the very bottom): add **Get Dictionary Value**,
    `summary` in **Contents of URL**, then **Show Notification** with that
    Dictionary Value. It says, for example, "3 Kin alarms: 08:00, 20:00 and
    21:00", or why the link didn't work.
11. **Try it with your own link.** Make a link on the
    [Medicine alarms screen](https://kin-family-app.vercel.app/settings/notifications/alarms),
    paste it into the Text from step 2 in place of the placeholder, and tap
    ▶. Allow it to connect to kin-family-app.vercel.app when asked. Check
    Clock shows `Kin · …` alarms, then try one with the phone on silent.
    **Then put the placeholder back** (`Paste your Kin link here`).
12. **The Import Question.** Open the Shortcut's details: tap the name at the
    top (or the ⓘ at the bottom, depending on the version) → **Details** or
    **Setup** → **Add Import Question** (*unsure* of the exact path on iOS
    26: it is with the Shortcut's settings, not with the actions). Choose
    the **Text** field from step 2. Question: `Paste your Kin link. Kin
    shows it under Settings, Notifications, Medicine alarms.` Leave the
    default answer empty.
13. **Share it.** Back in the list of Shortcuts, long-press **Kin Alarms** →
    **Share** → **Copy iCloud Link**. The link looks like
    `https://www.icloud.com/shortcuts/…`.
14. **Give the link to a session.** Paste it into a Claude session with:
    "Set KIN_ALARMS_SHORTCUT_URL in kin/src/lib/dose-alarms.ts to <the
    link>". That PR turns on the **Add the Kin Alarms Shortcut** button;
    nobody assembles anything after that.

If you later change the Shortcut, share it again: an iCloud link is a copy
of the Shortcut as it was when shared, so the session needs the new link.
