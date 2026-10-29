# App Review: sign-in, notes and contact

App Store Connect → your app → the 1.0 version page → **App Review
Information**.

## The review account (you create it once, before submitting)

The reviewer signs in to the live Kin (the app loads
`https://kin-family-app.vercel.app`), so the account must exist in
**production**. It must be a **sample household made only for Apple**:
never your own family's, never Janine's, never a real household's.

1. In a private browser window, open
   [kin-family-app.vercel.app/signup](https://kin-family-app.vercel.app/signup) and
   sign up with an address you can read that is not your usual one, e.g.
   `<you>+appreview@gmail.com` (Gmail delivers `+anything` to your own
   inbox). Use a password made only for this, and confirm the email.
2. Create the household **"Rivera Family (App Review)"**, with you as
   **"Alex Rivera"**, a parent.
3. Give the household Plus for good, so the reviewer can open everything and
   never meets a part of Kin they cannot unlock. Kin sells nothing in the
   app, and a reviewer who meets "part of Kin Plus" may ask how to buy it.
   Do it the way your own two households got Plus for good: a Kin code
   that grants Plus for good ("comped"), entered at
   [kin-family-app.vercel.app/subscribe](https://kin-family-app.vercel.app/subscribe)
   **in the browser** (the iPhone app has no code box). If you have no spare
   code, add one row to the `access_codes` table of the production project in
   the [Supabase table editor](https://supabase.com/dashboard/project/lffqluudphzviubygwjs/editor):
   copy `grants` from one of your existing comped codes, `max_uses` 1,
   `note` "App Review household", and a code of your own making in the
   `KIN-XXXXXX` shape. That row touches no household until it is entered.
   The plan screen then says "Your household has Kin Plus for free, for good."
4. Add a little sample life, so the screens are not empty. Everything here
   is invented:
   - a managed child, "Mia Rivera", born 2019;
   - a plan tomorrow at 10:00, "Mia: dentist";
   - a medicine for Alex, "Vitamin D", one dose a day **at a time about
     5 minutes after you expect the reviewer to try it** (or just every
     morning at 08:00; the notes below tell them how to make one ring);
   - a bill, "Electricity", due in three days;
   - three things on the shopping list;
   - one chat message in the family chat.
5. Put the email and password in **Sign-In Information** below. Leave the
   account alone after that: the reviewer may sign in days later.

When Apple has approved the app, the account can stay for the next review
(each update is reviewed with it too).

## Sign-In Information

- **Sign-in required:** Yes
- **User name:** the email from step 1
- **Password:** the password from step 1

## Contact Information

Your first and last name, a phone number Apple can reach you on, and your
email. Apple uses this only to ask about the review.

## Notes (paste as is; under Apple's 4000 characters)

<!-- field: reviewnotes, max 4000 -->
```
Kin is a private app for one household: its calendar, lists, chat, health records and money, shared only with the people the household invites. The account above is a sample household made for App Review; nothing in it is real.

WHAT IS NATIVE (beyond the web view)
1. Alarms (AlarmKit, iOS 26 and later). Settings → Notifications → Alarms. Tap "Allow alarms" when asked. Medicine doses ring at their time; each plan, check-up or bill can be switched on to ring too. To hear one now: Family → Alex Rivera → About → Medicines → Vitamin D → set a dose time three minutes from now, save, then lock the phone. It rings full screen through the silent switch. On iOS 17 to 18 the same appears as a time-sensitive notification.
2. Calls (CallKit and PushKit). A Kin voice or video call from another family member rings with the iPhone's incoming-call screen, also when Kin is closed. PushKit (VoIP) pushes are sent only for a ringing Kin call, and every one is reported to CallKit at once. Testing this needs a second signed-in device in the same household; we are happy to arrange a call or send a screen recording on request.
3. Widgets (WidgetKit). Long-press the Home Screen → + → Kin: "Today" (next dose and next plan; small, medium and three Lock Screen sizes) and "To-Buy" (the shopping list count). A tap opens that page in Kin.
4. Notifications (APNs), including SOS: The SOS button on Today (in the family card) sends the family a time-sensitive alert with the sender's location.
5. A silent background push once a day keeps the next two weeks of alarms on the phone without Kin being opened.

BACKGROUND MODES
- voip: only for ringing Kin calls (above).
- remote-notification: the daily silent alarm re-sync.
- audio: so a call answered through CallKit keeps its sound when the screen locks or the person leaves Kin.

ACCOUNT DELETION
Settings → Account → Delete my account. It takes effect after 7 days (signing in during them offers to keep the account), as the privacy notice explains.

PURCHASES
The app has no in-app purchases and sells nothing. It shows no prices and no links to buy. The review household has every feature on.

SIGN-IN
Email and password only, Kin's own accounts. There is no third-party or social login.

CONTENT
Everything is private to the household. Members are invited by the household's organizer, who can remove any of them; children join only with a parent's approval and start in kid view. Sharing with another household (a linked relative) is opt-in and can be unlinked at any time. Reports reach us through the Support URL.
```

## Attachment (optional, recommended)

A short screen recording from your own iPhone, once TestFlight works: a
dose alarm ringing on the lock screen, and a call ringing from Janine's
phone. Attach it under **App Review Information → Attachment**. It answers
the question a reviewer cannot test alone (calls need two phones).

Record only the sample household, never your own family's screens.
