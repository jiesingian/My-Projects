# Age rating answers

App Store Connect → your app → **App Information → Age Rating → Set Up
Age Rating**. Apple's questionnaire as of 29 October 2026: the 2025
categories (in-app controls, capabilities, mature themes, medical and
wellness, sexuality, violence, chance-based activities) and the social
media questions mandatory since September 2026. If a question reads
differently from these words, answer it from the reason given, not the
wording.

**Expected result: 9+** (from "Health or Wellness Topics"). If App Store
Connect shows a different rating, read the line that raised it before
submitting.

## In-app controls

| Question | Answer | Why |
|---|---|---|
| Parental Controls | **Yes** | A child's login needs the organizer's approval and starts in kid view, which keeps money, the vault and health records out of reach. |
| Age Assurance | **No** | Kin does not verify ages. |

## Capabilities

| Question | Answer | Why |
|---|---|---|
| Unrestricted Web Access | **No** | The app shows only Kin's own site; navigation is limited to it (`limitsNavigationsToAppBoundDomains`, `allowNavigation`). Other links open in Safari. "Yes" would make it 16+. |
| User-Generated Content | **Yes** | Chat, photos and the journal, seen only by the household (and linked relatives, if both households choose). |
| Messaging and Chat | **Yes** | Family chat and calls, only between people in the household. |
| Social Media | **No** | No public profiles, no feed of strangers, no followers. The relatives' feed is private between linked households. If App Store Connect describes "Social Media" as any feed of user content, answer **Yes** and accept 13+, rather than risk a rejection for a wrong answer. |
| Advertising | **No** | No ads in the app. |

## Mature themes, sexuality, violence

Every question: **None**. Kin has no such content of its own; what a
family writes is private to it.

## Medical or wellness

| Question | Answer | Why |
|---|---|---|
| Medical or Treatment Information | **None** | Kin keeps what a family enters (medicines, doses, vitals) and gives no medical or treatment advice. Growth charts compare a child's measurements with the WHO standards. If Apple's text counts reference charts as medical information, answer **Infrequent** (13+). |
| Health or Wellness Topics | **Yes** | Medicine reminders, vitals, health records. |

## Chance-based activities

Gambling, simulated gambling, loot boxes: **None**. Contests: **None**.
The savings circles (paluwagan) are a record the family keeps, not a game
of chance.

## Kids Category

Do **not** choose "Made for Kids". Kin is for the grown-ups who run a household. Kids-category apps
may have no links out and no purchases even behind a gate (1.3), and that
choice can never be undone.
