# Kin's Google Play listing, ready to paste

English only (`kin/CLAUDE.md`). Each field names where it goes in the Play
Console. Lengths are checked against Google's limits (title 30, short
description 80, full description 4000 characters).

## Main store listing (Grow users → Store presence → Main store listing)

**App name** (30): `Kin: Family Organizer`

**Short description** (80):

```
Your family's calendar, lists, chat, medicines and money, together in one app.
```

**Full description** (4000):

```
Kin is one private place for your household: the calendar, the chores, the shopping list, the family chat, everyone's medicines, and the money. Only the people you invite can see it. No ads, no strangers, no algorithm.

ALARMS THAT RING
• Medicine doses ring like an alarm clock, full screen over the lock screen, even when the phone is on silent, until someone stops them.
• Choose which plans, check-ups and bills ring too.
• Kin keeps them set by itself: after a restart, after an update, and every day without you opening the app.

CALLS THAT RING LIKE A PHONE CALL
• Voice and video calls with your family, with Android's own incoming-call screen: answer or decline from the lock screen.
• SOS: one press tells your family where you are, and comes through Do Not Disturb on their phones.

THE FAMILY'S DAY
• A shared calendar and planner, with Google Calendar sync.
• Today: what's next for everyone, in one list.
• Chores, stars and rewards, and a kid view.
• Shopping list, pantry and meal plans.
• Family chat with photos, polls and voice notes.

HEALTH
• Health profiles and an emergency card for each person.
• Medicines with dose reminders, vitals, growth charts and visits.

MONEY
• Accounts, budgets, bills and reminders, and net worth.
• Loans between family and savings circles, with reminders.

MEMORIES
• A family journal and photos, the family tree, and a feed for the relatives you link to.

KIN AI
• Ask Kin anything about your household ("when is Lola's next check-up?"), or scan a grocery flyer into your list.

MADE FOR FILIPINO FAMILIES
• Pesos, Philippine holidays and Manila time by default, bills like Meralco, and family money like paluwagan.

PRIVATE BY DESIGN
• Your household's records are walled off from every other household.
• Some records can be kept to the grown-ups, or to the person they're about.
• Delete your account at any time, from the app or any browser.

Kin Free covers the family's day for good. Kin Plus adds Wealth, the vault, medicines and unlimited Kin AI for the whole household; every family starts with a free trial.
```

**App icon**: `store/icon-512.png` (512 × 512, 32-bit PNG).

**Feature graphic**: `store/feature-graphic.png` (1024 × 500, no
transparency).

**Phone screenshots**: `store/screenshots/01-today.png` to `04-wealth.png`
(1080 × 2160), made by `store/screenshots.mjs` from the QA household on 29
October. Upload them in file-name order; Google takes 2 to 8. No tablet
screenshots: Kin is listed for phones.

Shots of calls and alarms would sell the app better. They have to be
taken on a real phone: from the review household (below), or your own with
nothing private on screen.

## Store settings (Grow users → Store presence → Store settings)

- **App or game:** App.
- **Category:** Lifestyle. Productivity also fits; Lifestyle is where family
  organisers usually sit, and keeps it away from "kids" categories.
- **Tags:** Family, Calendar, Organizer (pick the closest Google offers).
- **Contact details:**
  - **Email** (required, shown on the listing): Jonathan's choice. The
    address that already sends Kin's sign-up emails, `familyapp.kin@gmail.com`,
    works. The account-deletion page sends people who can't sign in to it.
  - **Website:** `https://kin-family-app.vercel.app`.
  - **Phone:** leave empty.

## App content (Policy → App content)

| Question | Answer |
|---|---|
| **Privacy policy** | `https://kin-family-app.vercel.app/legal/privacy` |
| **Ads** | No, the app contains no ads. |
| **App access** | All or some functionality is restricted → add the review login (below). |
| **Content rating** | The IARC questionnaire (below). |
| **Target audience** | 18 and over only (`store/POLICY.md`). |
| **News app** | No. |
| **Data safety** | `store/DATA_SAFETY.md`. |
| **Government app** | No. |
| **Financial features** | Kin keeps a family's own budgets, bills, accounts and loans as records; it does not move money, lend, or give financial advice. Pick the option for budgeting / personal finance management only, nothing else. |
| **Health apps** | Medication management, plus personal health records if listed (`store/POLICY.md`). |
| **Full-screen intent** | Calling and alarm (`store/POLICY.md`, with the text to paste). |
| **Exact alarm** | Not asked: Kin uses `SCHEDULE_EXACT_ALARM`. |
| **Foreground service** | Not asked: Kin has none. |
| **Advertising ID** | No. Kin doesn't use it. |

### App access: the review login

Google's reviewers sign in to check Kin. They get a **sample household on
production**, made by Jonathan and filled with made-up people. Never a real
family, and never one of the QA accounts on dev: the Android app loads the
live site, so the reviewer needs an account there.

1. In a private browser window, sign up at
   `https://kin-family-app.vercel.app/signup` with
   `familyapp.kin+review@gmail.com` (the `+review` part lands in the same
   inbox) and a new password. Keep the password in your password manager.
2. Verify the email from that inbox.
3. Name yourself `Alex Reyes` and the household `Reyes Family (sample)`.
4. Give it Plus with a Kin code, so reviewers can open every area
   (Settings → Your plan → Kin code).
5. Add a little made-up life:
   - two plans this week;
   - a medicine with a dose time ("Vitamin C, 08:00");
   - three items on To-Buy;
   - a bill;
   - a managed child profile ("Mia").

   No real names, photos, numbers or addresses.
6. In App access, paste:

```
Sign in at the first screen with:
Email: familyapp.kin+review@gmail.com
Password: <the password>

This is a sample household with made-up people. Kin's native features:
- Alarms: Settings → Notifications → Alarms. Allow notifications, "Alarms & reminders" and full screen when asked; the medicine "Vitamin C" rings at 08:00 Manila time.
- Calls ring with Android's incoming-call screen. A call needs a second signed-in member.
- Account deletion: Settings → Account → Delete my account (please don't confirm it).
```

## Content rating (IARC questionnaire)

Policy → App content → Content rating → Start questionnaire.

- **Email:** the contact email.
- **Category:** "All other app types". Google's list may say "Utility,
  Productivity, Communication, or Other".

| Question | Answer |
|---|---|
| Violence, blood, gore | No |
| Sexuality, nudity | No |
| Language (profanity, crude humour) | No |
| Controlled substances (drugs, alcohol, tobacco) | No. Medicines are the family's own records, not drug use. |
| Gambling, simulated gambling | No |
| Users can interact or exchange content (chat, voice, video, photos) | **Yes**, only with people in their own household, and relatives they link to |
| Shares the user's location with other users | **Yes**, only when the person presses SOS or "I've arrived", or turns sharing on |
| Purchase of digital goods in the app | No. Nothing is sold inside the app. |
| Unrestricted internet access (a browser) | No |
| Promotes or sells age-restricted products | No |

**Expected rating:** Everyone / PEGI 3 or similar, with "Users Interact" and
"Shares Location". If a region's board rates it higher, accept it: the
audience is 18 and over anyway.
