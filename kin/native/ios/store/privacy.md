# App Privacy answers (the "nutrition label")

App Store Connect → your app → **App Privacy** (in the left column, under
"General"). Written from what Kin keeps (the privacy notice,
`kin/src/app/legal/privacy/page.tsx`, and the schema), on 29 October 2026.
The app's privacy manifest (`App/PrivacyInfo.xcprivacy`) lists the same
types; if one changes, change both.

**Privacy Policy URL:** `https://kin-family-app.vercel.app/legal/privacy`

## The first questions

- "Do you or your third-party partners collect data from this app?" **Yes.**
- For every type below, Apple asks three things. The answers are the same for each type unless the table says otherwise:
  - **How is it used?** Tick **App Functionality** only. Kin does no analytics product, no ads, no personalised marketing.
  - **Is it linked to the user's identity?** **Yes**: it belongs to the person's account and household.
  - **Is it used for tracking?** **No.** Kin has no advertising SDK and shares nothing with data brokers. The Meta Pixel switch (`NEXT_PUBLIC_AD_TRACKING`) affects only the public web pages, never the app, and is off. If it is ever switched on *and* the app were to load it, these answers would change. It doesn't.

## Data types to tick

| Apple's category | Type | Why Kin has it | Linked |
|---|---|---|---|
| Contact Info | **Name** | Each person's profile name | Yes |
| Contact Info | **Email Address** | Sign-in | Yes |
| Contact Info | **Phone Number** | Optional mobile number on a profile | Yes |
| Health & Fitness | **Health** | Medicines and doses, vitals, conditions, illnesses, visits, vaccinations, the emergency card | Yes |
| Health & Fitness | **Fitness** | Steps and activity, when someone connects Apple Health through the Shortcut | Yes |
| Financial Info | **Other Financial Info** | Accounts, balances, budgets, bills, loans, goals the household enters | Yes |
| Contact Info | **Physical Address** | The household's addresses, if added (Google Play's answers tick Address too) | Yes |
| Location | **Precise Location** | Location sharing a person switches on, an SOS, and "I've arrived" | Yes |
| User Content | **Emails or Text Messages** | Family chat messages | Yes |
| User Content | **Photos or Videos** | Chat, journal and profile photos | Yes |
| User Content | **Audio Data** | Voice notes and recorded stories | Yes |
| User Content | **Other User Content** | Calendar, lists, journal, the family tree, vault documents | Yes |
| Identifiers | **User ID** | The account id | Yes |
| Identifiers | **Device ID** | The phone's push addresses (Apple's tokens), to deliver notifications and calls | Yes |
| Usage Data | **Product Interaction** | How many Kin AI questions a household used this month | Yes |
| Diagnostics | **Crash Data** | An error the app hit: page, message, stack | **No** (sent without the session) |
| Diagnostics | **Other Diagnostic Data** | The same error reports | **No** |
| Other Data | **Other Data Types** | Birthdays, children's details a parent adds | Yes |

**Leave unticked:** Other User Contact Info, Payment
Info, Credit Info, Sensitive Info, Contacts, Browsing History, Search
History, Coarse Location, Purchases, Advertising Data, Other Usage Data,
Performance Data, Gameplay Content, Customer Support, Environment Scanning,
Hands, Head, Body.

- **Sensitive Info** in Apple's sense is racial or ethnic data, sexual orientation, pregnancy, disability, religion, union membership, politics, genetics or biometrics. Kin asks for none of these. Health is its own category, ticked above.
- **Purchases** and **Payment Info**: untick for now. Payments do not exist yet, and the app sells nothing. When paid plans start on the web, tick **Purchases**, linked, App Functionality, because the account's plan history is kept. Card details stay with the payment provider, never Kin.
- **Customer Support**: tick it once the support email exists and support mail is kept with the account.

## After publishing

Apple shows the answers on the App Store page at once. They can be changed
at any time without a new build.
