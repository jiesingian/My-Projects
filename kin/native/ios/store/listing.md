# The App Store listing

Paste each block into App Store Connect, at the field named in its heading.
The limits are Apple's; `check.mjs` in this folder counts every block against
them. English only (`kin/CLAUDE.md`).

**Never in any of this text:** a price, "Kin Plus", "subscribe", "upgrade",
"free trial", or the website as a place to buy. Outside the US storefront an
app's metadata may not point to a way to pay other than Apple's (App Review
3.1.1), and Kin sells nothing through Apple.

## App Information

### Name (30)
<!-- field: name, max 30 -->
```
Kin: Family Life, Decoded
```
If App Store Connect says the name is taken, try in order: `Kin Family: Life, Decoded`,
`Kin – Family Organizer`, `Kin Family`. The name under the icon on the phone
stays "Kin" whatever this says (`CFBundleDisplayName`).

### Subtitle (30)
<!-- field: subtitle, max 30 -->
```
Medicine alarms, plans & chat
```

### Category
- Primary: **Lifestyle**
- Secondary: **Productivity**

Not Health & Fitness, because Kin keeps a family's records and gives no
medical advice. Not the Kids category either: Kin is for the grown-ups who
run a household, and Kids-category apps may not link out at all (1.3).

### Content rights
"Does your app contain, show, or access third-party content?": **No**. Families add their
own photos, files and words; Kin shows no one else's content.

## Version page (1.0)

### Promotional text (170)
<!-- field: promotional, max 170 -->
```
Medicine doses ring like an alarm clock, even on silent. Family calls ring like a phone call. One private place for your household's plans, lists, chat and memories.
```

### Description (4000)
<!-- field: description, max 4000 -->
```
Kin is one private place for everything your household shares: the calendar, the shopping list, chores, chat, photos, health records and money. Only the people you invite can see it.

ALARMS THAT ACTUALLY RING
• Medicine doses ring like the Clock app's alarm, full screen and through the silent switch, until someone stops them (iOS 26 and later; earlier iPhones get a time-sensitive notification).
• Choose which plans, check-ups and bills ring too: a plan half an hour before, a check-up an hour before, a bill on the morning it is due.
• Kin keeps the next two weeks of alarms on the phone, and tops them up by itself.

CALLS THAT RING LIKE A PHONE
• Voice and video calls with your family ring with the iPhone's own incoming-call screen, even when Kin is closed.
• An SOS reaches the family with your location, through Focus.

TODAY, AT A GLANCE
• One list of what needs you today: plans, bills, check-ups, birthdays, chores and the shopping.
• Home Screen and Lock Screen widgets show the next dose, the next plan and how many things are on the list.

THE HOUSEHOLD, ORGANISED
• A shared calendar and planner, with Google Calendar sync.
• Chores with stars and rewards, a weekly allowance and a piggy bank for the children, and a kid view that keeps grown-up things out of reach.
• The shopping list, the pantry and the week's meals.
• Family chat with photos, voice notes and polls.

HEALTH AND SAFETY
• Health profiles, allergies and an emergency card for each person.
• Medicines and doses, vitals, illnesses, check-ups, vaccinations and growth charts.

MONEY, TOGETHER
• Accounts, budgets, bills and their reminders, goals and net worth.
• Lending between relatives and savings circles, with reminders you send yourself.
• A vault for documents and shared passwords, behind Face ID.

MEMORIES
• A journal with photos, and recorded stories from the grandparents.
• A family tree, and a feed shared only with the relatives you link to.

ASK KIN
• Ask "when is the electricity bill due?", "what's for dinner?" or "add milk to the list", and Kin answers from your household's own records.

PRIVATE BY DESIGN
• Each household is walled off from every other one in the database itself.
• No ads, no algorithm, no strangers. Kin does not sell your information or use it to train AI.
• Delete your account at any time from Settings → Account.
```

### Keywords (100)
<!-- field: keywords, max 100 -->
```
family,organizer,calendar,medicine,reminder,alarm,chores,shopping list,budget,household,chat,sos
```

### What's New in This Version (4000)
<!-- field: whatsnew, max 4000 -->
```
The first Kin for iPhone: medicine and plan alarms that ring through silent, family calls on the iPhone's own call screen, and Home Screen and Lock Screen widgets.
```

### URLs
- **Support URL:** `https://kin-family-app.vercel.app/legal/support`
- **Marketing URL** (optional): `https://kin-family-app.vercel.app/`
- **Privacy Policy URL** (App Privacy page): `https://kin-family-app.vercel.app/legal/privacy`

### Copyright
```
2026 <your full legal name>
```
For an Individual enrolment this is your own name, as on the Apple
Developer account. It becomes the business's name if the app is moved to a
company account later.

### Version and build
- Version: **1.0** (`MARKETING_VERSION`).
- Build: the TestFlight run's number (`testflight.yml` sets
  `CURRENT_PROJECT_VERSION` to it), picked under "Build" on this page.

### Pricing and availability
- Price: **Free** (Pricing and Availability → Price Schedule → Free).
- Availability: start with **the Philippines** (Kin's money and words are
  Philippine). More countries can be ticked later.
- In-app purchases: **none**.
