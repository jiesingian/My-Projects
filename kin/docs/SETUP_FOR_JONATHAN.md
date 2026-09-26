# Setup that needs Jonathan

Each item here is a secret, an outside account or money, which `CLAUDE.md`
keeps with Jonathan. Everything else is already built and merged; these
steps switch it on. Each says what it is for and what is safe.

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
directly, and a relay passes the call through. Kin reads three settings;
until they exist it uses no relay.

**Safe to do.** A relay only forwards the call's encrypted packets; it cannot
hear or see the call. Free tiers are enough for a family; check the
provider's current free allowance when signing up.

1. Sign up for **Metered's free TURN** at
   [metered.ca/stun-turn](https://www.metered.ca/stun-turn), then open the
   [Metered dashboard](https://dashboard.metered.ca/) → TURN Server →
   **Credentials** → add one.
2. It shows a list of ICE servers with a **username** and **credential**.
   In [Vercel → Environment Variables](https://vercel.com/jisingian/kin-family-app/settings/environment-variables)
   add, for **Production**:
   - `TURN_URLS` = the `turn:` and `turns:` addresses from that list, joined
     with commas (e.g. `turn:a.relay.metered.ca:80,turns:a.relay.metered.ca:443?transport=tcp`)
   - `TURN_USERNAME` = the username
   - `TURN_CREDENTIAL` = the credential (Sensitive on)
3. **Redeploy** as in 1.3.

---

## 3. Turn off Realtime's public access (Janine can do this too)

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

## 4. Payments (GCash, Maya, cards)

A decision, not a setting: see `docs/PAYMENTS_OPTIONS.md` for PayMongo and
HitPay side by side, their fees, and what signing up involves.
