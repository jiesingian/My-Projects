# Google Play Data safety: Kin's answers

**Where:** Policy → App content → Data safety.

These answers come from what Kin actually keeps:
- the privacy notice, `src/app/legal/privacy/page.tsx`, "What Kin keeps";
- the database schema, `supabase/migrations/`;
- the Android app's own code, `kin/native/android`.

Re-check them when Kin starts keeping something new, or when payments go
live (see "Financial info" below).

How Google defines its terms
(https://support.google.com/googleplay/android-developer/answer/10787469):
- **Collected:** it leaves the phone for Kin's servers.
- **Shared:** it goes to another company **for that company's own use**.
  These do not count as sharing:
  - service providers working for Kin: Supabase, Vercel, Anthropic for
    Kin AI, the call relay, Firebase for push;
  - transfers the person starts themselves, such as Google Calendar or Drive
    sync.

So **Kin shares nothing**.

## Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes**. Everything goes over HTTPS/TLS: the app only loads `https://kin-family-app.vercel.app`; Supabase and Firebase are HTTPS. |
| Which ways can users request that their data is deleted? | **In the app** (Settings → Account → Delete my account), and **outside the app**: the delete account URL `https://kin-family-app.vercel.app/legal/delete-account` |
| Independent security review | No (leave unticked) |
| Families policy commitment | Not applicable (audience is 18+) |

## Data types

For every row below:
- **Shared:** No.
- **Processed ephemerally:** No.

"Optional" means the person chooses to add it; Kin works without it.

| Data type (Play's names) | Collected | Required or optional | Purposes | What it is in Kin |
|---|---|---|---|---|
| **Location → Approximate location** | Yes | Optional | App functionality | SOS, "I've arrived" and the family's places; only when pressed or switched on, only while open |
| **Location → Precise location** | Yes | Optional | App functionality | The same |
| **Personal info → Name** | Yes | Required | App functionality, Account management | Your name in the household |
| **Personal info → Email address** | Yes | Required | App functionality, Account management | Sign-in |
| **Personal info → User IDs** | Yes | Required | App functionality, Account management | The account's id |
| **Personal info → Phone number** | Yes | Optional | App functionality | If added to a profile or the emergency card |
| **Personal info → Address** | Yes | Optional | App functionality | The household's addresses, if added |
| **Personal info → Other info** | Yes | Optional | App functionality | Birthday, relationships, the family tree, emergency contacts |
| **Financial info → Other financial info** | Yes | Optional | App functionality | Accounts, balances, budgets, bills, loans, savings circles the household records |
| **Financial info → Purchase history** | **No**, for now | | | Nothing is bought in the app. Answer **Yes** (required, account management) once GCash/Maya/card payments go live on the website. |
| **Health and fitness → Health info** | Yes | Optional | App functionality | Conditions, medicines and doses, vitals, illnesses, visits, vaccinations, the emergency card |
| **Messages → Other in-app messages** | Yes | Optional | App functionality | Family chat |
| **Photos and videos → Photos** | Yes | Optional | App functionality | Chat and journal photos, profile photos, receipts, a flyer to scan |
| **Photos and videos → Videos** | Yes | Optional | App functionality | Videos sent in chat or the journal, if any |
| **Audio → Voice or sound recordings** | Yes | Optional | App functionality | Voice notes in chat. Calls are not recorded or stored. |
| **Files and docs** | Yes | Optional | App functionality | Documents in the vault and files in chat |
| **Calendar → Calendar events** | Yes | Optional | App functionality | The family calendar, and Google Calendar if connected |
| **App activity → Other user-generated content** | Yes | Optional | App functionality | Lists, notes, journal entries, chores, questions asked to Kin AI |
| **App activity → App interactions** | Yes | Required | App functionality | What's done, snoozed or seen (to show Today correctly) |
| **App info and performance → Crash logs** | Yes | Required | Analytics | Kin's own error reports, kept in Kin's database to fix bugs |
| **App info and performance → Diagnostics** | Yes | Required | Analytics | The same reports' technical details |
| **Device or other IDs** | Yes | Required | App functionality | The phone's push token (Firebase), to deliver alarms, calls and notifications |

**Not collected:**
- Contacts: Kin never reads the phone's address book.
- Web browsing.
- Installed apps.
- SMS or call logs.
- Music.
- Race, religion, politics, sexual orientation.
- Fitness info (activity).
- Advertising ID.

## Children

The audience is 18+, so there is no Families form. The privacy notice's
"Children" section covers profiles of children that a parent manages. Data
about a child is collected the same way as above; Data safety has no
separate question for it.

## Privacy policy URL check (29 October 2026)

- `https://kin-family-app.vercel.app/legal/privacy` returns HTTP 200 without
  signing in.
- `/legal/` is public in `src/lib/supabase/middleware.ts`, so reviewers can
  read it.
