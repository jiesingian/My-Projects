# Setup that needs Jonathan

Each item here is a secret, an outside account or money, which `CLAUDE.md`
keeps with Jonathan. Everything else is already built and merged; these
steps switch it on. Each says what it is for and what is safe.

**Where things stand (29 September):**

| | |
|---|---|
| 1. Reminders | Done: secrets set, `kin-reminders` runs every five minutes |
| 2. Calls on mobile data | To do: free Metered account, steps below |
| 3. Realtime public access off | Done on dev and production |
| 4. Kin AI and flyer scanning | Final stage (costs money), see BACKLOG |
| 5. Payments | Final stage (costs money), see BACKLOG |
| 6. GIFs in the chat | Held for design finalization |
| 7. Sign-up emails through Gmail | Done: sent from familyapp.kin@gmail.com |

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

## 4. Scanning a flyer or invitation (Planner → Add)

**What it switches on.** Planner → Add → *Scan a flyer or invitation*: take
or choose a photo of a school memo, an invite or a poster, and Kin reads the
dates off it and offers them as calendar entries to tick. It reads the photo
with Claude (`src/lib/actions/flyer.ts`). Until the key below exists the card
just says scanning isn't switched on, and nothing is sent anywhere.

**What it costs.** Roughly US$0.02–0.06 a scan (a phone photo shrunk to
1600px, read by Claude Opus 5 at medium effort) -- a few pesos. A monthly
spend limit caps it; US$5 is hundreds of scans.

**Safe to do.** Only the one photo being scanned is sent, and nothing is
saved until someone ticks what to add. Deleting the key switches scanning
off again.

1. Open the [Claude Console](https://console.anthropic.com/) and sign in (or
   sign up) with the account that should be billed.
2. [Billing](https://console.anthropic.com/settings/billing): add a card and a
   small amount of credit.
3. [Limits](https://console.anthropic.com/settings/limits): set a monthly
   spend limit, e.g. US$5.
4. [API keys](https://console.anthropic.com/settings/keys) → **Create key**,
   name it `kin-flyer-scan`, copy it (it is shown once).
5. In [Vercel → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables)
   add `ANTHROPIC_API_KEY` = the key, Environment **Production** (and Preview
   if you want scans on preview links), Sensitive on, Save.
6. **Redeploy** as in 1.3. The card then shows *Take or choose a photo*.

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
