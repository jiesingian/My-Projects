/** Settings -> Help: every feature, tab by tab -- what it is, how to use it,
 * pros, cons and tips (Jonathan, 23 October). Written for the families who
 * use Kin, from the feature guide checked against the app on 23 October.
 * When a feature changes, change its entry here in the same pull request;
 * e2e/help-guide.logic.spec.ts checks every entry is complete. */

export type HelpTag = "plus" | "phone" | "setup" | "ai" | "link";

export type HelpFeature = {
  name: string;
  tags: HelpTag[];
  what: string;
  how: string;
  pros: string[];
  cons: string[];
  tips: string[];
};

export type HelpTab = { id: string; name: string; intro: string; groups: { title: string; features: HelpFeature[] }[] };

export const HELP_TAG_LABELS: Record<HelpTag, string> = {
  plus: "Plus",
  phone: "Needs a phone",
  setup: "Needs setup",
  ai: "Kin AI",
  link: "Linked household",
};

/** Tabs a child in kid view does not open, so their help is left out too. */
export const HELP_TABS_HIDDEN_IN_KID_VIEW = ["household", "wealth", "settings"];
/** Groups inside a tab kid view keeps out of reach (health records, the vault). */
export const HELP_GROUPS_HIDDEN_IN_KID_VIEW = ["Health", "Vault"];

export const HELP_GUIDE: HelpTab[] = [
  {
    "id": "family",
    "name": "Family",
    "intro": "The people side of the house: who is in it, how they are, what they keep, where they come from and where they are now.",
    "groups": [
      {
        "title": "Profile",
        "features": [
          {
            "name": "Household photo, About the family, addresses",
            "tags": [],
            "what": "A photo of the whole family, a paragraph about it, and any number of addresses: home, the province, the condo.",
            "how": "Family → Profile. Add the home address first.",
            "pros": [
              "SOS, the emergency card and \"Save where I am now\" fall back on the home address.",
              "Relatives who link with you see who you are at a glance."
            ],
            "cons": [],
            "tips": [
              "add the home address first; SOS and the emergency card fall back on it."
            ]
          },
          {
            "name": "Members and roles",
            "tags": [],
            "what": "Everyone in the household with their role: organizer, adult, or a managed child whose profile a parent writes.",
            "how": "Family → Profile → the member list. Invite a grown-up with the code in Settings → Household; add a young child as a managed profile, or let a child join with the code and approve them as \"Child (own login, kid view)\".",
            "pros": [
              "Children are in the app from birth without needing a phone or an email.",
              "A child of any age can have their own login once a parent approves it, starting in kid view.",
              "The week a managed child turns 13, Kin tells the grown-ups they can have their own login."
            ],
            "cons": [
              "A managed child doesn't sign in; approve a child's own join request to give them a login."
            ],
            "tips": []
          },
          {
            "name": "Member page: Moments and About",
            "tags": [],
            "what": "One page per person. Moments gathers every journal entry they were in; About holds school, work, sizes (shoe, shirt, pants), contact details and Philippine IDs (SSS, PhilHealth, Pag-IBIG, TIN).",
            "how": "Tap a person anywhere in the app. Fill About once; tag them in journal entries to fill Moments.",
            "pros": [
              "The sizes make gift-buying easy.",
              "IDs are at hand when filling in a school or bank form."
            ],
            "cons": [],
            "tips": [
              "Message on a child's page opens the household chat with them mentioned, since a managed child has no phone; Call shows only for someone who can answer."
            ]
          },
          {
            "name": "Stories about a person",
            "tags": [],
            "what": "Photos, scanned papers and recorded stories about someone, with a transcript made on the phone.",
            "how": "Open a member page or a person on the tree → Stories. Press record and let Lola talk.",
            "pros": [
              "Keeps the family's history in the voices of the people who lived it.",
              "The transcript makes a story searchable."
            ],
            "cons": [],
            "tips": [
              "record one story per grandparent at the next family lunch; it starts empty until someone presses record."
            ]
          },
          {
            "name": "Connections",
            "tags": [],
            "what": "Your own code and share link for people outside the household: friends, ninongs, relatives. A connection lets you message them and see what they mark Public.",
            "how": "Family → Profile → Connections. Share your code, or type theirs. Grown-ups in the same household are connected from the start.",
            "pros": [
              "No need to merge households just to message someone.",
              "Either side can remove a connection at any time."
            ],
            "cons": [
              "Someone outside the household has to accept first. Grown-ups in your own household are connected already."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Health",
        "features": [
          {
            "name": "Health summary",
            "tags": [
              "plus"
            ],
            "what": "This week's health jobs at the top (\"Dental check-up is overdue\"), then a card per person with blood type, allergies, insurance and doctor.",
            "how": "Family → Health. Tap any \"Not recorded · add\" to jump to the field that fills it.",
            "pros": [
              "The whole family's health on one screen.",
              "Overdue check-ups surface before anyone remembers to look."
            ],
            "cons": [],
            "tips": [
              "tap each \"Not recorded · add\"; every one opens the field that fills it."
            ]
          },
          {
            "name": "Records per person: Schedule, Vaccines, Medicines, Illness, Conditions, Labs, Vitals",
            "tags": [
              "plus"
            ],
            "what": "A full health record for each person. Appointments go to the Planner and Today when due. Vaccines appear for under-18s and follow the DOH schedule.",
            "how": "Family → Health → a person. Start with each child's vaccines and any maintenance medicine.",
            "pros": [
              "Answers \"when was her last tetanus shot?\" in seconds.",
              "Appointments remind you without a second calendar."
            ],
            "cons": [],
            "tips": [
              "fill the past in one sitting with the baby book; from then on appointments remind you."
            ]
          },
          {
            "name": "Medicines: doses, reminders, refills",
            "tags": [
              "plus",
              "phone"
            ],
            "what": "Each medicine with its times and dose. Kin reminds the person, alerts a named grown-up if a dose is missed, counts the pills left and puts a refill on To-Buy.",
            "how": "Family → Health → a person → Medicines → add. Enter the times and how many pills are left.",
            "pros": [
              "The refill lands on the shopping list before the bottle runs out.",
              "A grown-up hears about a missed dose for Lolo's maintenance medicine."
            ],
            "cons": [
              "Reminders need notifications allowed on the phone."
            ],
            "tips": [
              "tick each dose so the pill count, and so the refill, stays right."
            ]
          },
          {
            "name": "Emergency card",
            "tags": [],
            "what": "Blood type, allergies, current medicines, conditions, doctor and insurance on one card you can share or print, dated the day it was made. It shows how many of the six lines are filled, and each blank links to where to fill it.",
            "how": "Family → Health → Emergency card. Fill the blanks, then Share or Print for the yaya, the school or your wallet.",
            "pros": [
              "The card a hospital nurse needs, ready before the emergency.",
              "It stays current because it reads from the profiles."
            ],
            "cons": [],
            "tips": [
              "each printed or shared card says the day it was made (\"As of …\"), so print a fresh one after a medicine changes."
            ]
          },
          {
            "name": "Doctor-visit sheet",
            "tags": [],
            "what": "One page to bring to a check-up: medicines and doses, allergies, the latest readings, recent illness, a child's vaccines, and the questions the family wants to ask.",
            "how": "Open a person's page → Doctor-visit sheet. Add questions during the week, then print or share it at the clinic.",
            "pros": [
              "Nothing is forgotten in a ten-minute consult.",
              "Questions can be marked asked during the visit."
            ],
            "cons": [
              "A private record stays off the sheet for anyone not allowed to see it."
            ],
            "tips": []
          },
          {
            "name": "Apple Health vitals and growth charts",
            "tags": [
              "setup",
              "phone"
            ],
            "what": "Steps, weight, resting heart rate and sleep arrive from an iPhone Shortcut each evening. Children's height and weight draw WHO growth charts.",
            "how": "Settings → Connected apps → Apple Health, and follow the Shortcut steps. Choose who sees the numbers: whole family, parents only or just you.",
            "pros": [
              "Numbers arrive without typing.",
              "Growth charts show at a glance if a child is on track."
            ],
            "cons": [
              "iPhone only, and the Shortcut is set up on each phone."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Vault",
        "features": [
          {
            "name": "Documents",
            "tags": [
              "plus"
            ],
            "what": "PSA certificates, passports, titles and policies with whose they are, the expiry date (which becomes a renewal reminder) and who may see them: whole family, parents only or just me.",
            "how": "Family → Vault → Add. Upload a PDF or photo and set Expires.",
            "pros": [
              "Passport and licence renewals are reminded months ahead.",
              "With Google Drive connected, the files stay in your own Drive."
            ],
            "cons": [],
            "tips": [
              "connect Google Drive so files stay in your own Drive and not in the household's storage."
            ]
          },
          {
            "name": "Passwords",
            "tags": [
              "plus"
            ],
            "what": "Wi-Fi, door and gate codes, streaming and utility logins, grouped by kind.",
            "how": "Family → Vault → Passwords. Press and hold to reveal; Copy never shows it on screen.",
            "pros": [
              "The Wi-Fi and gate code are there when a visitor or the helper asks.",
              "Visibility per entry keeps the bank login away from the children."
            ],
            "cons": [],
            "tips": [
              "turn on the vault lock, or anyone holding an unlocked phone can open them."
            ]
          },
          {
            "name": "Vault lock (PIN or Face ID)",
            "tags": [
              "phone"
            ],
            "what": "A second lock on the vault, on top of the phone's own, with a way back through your Kin password if the PIN is forgotten.",
            "how": "Family → Vault, or Settings → Privacy & lock. Turn it on before the first document goes in.",
            "pros": [
              "A borrowed phone does not open the family's papers."
            ],
            "cons": [],
            "tips": [
              "forgot the PIN? \"Can't unlock? Use your Kin password\" opens it and clears the PIN, so you can set a new one."
            ]
          }
        ]
      },
      {
        "title": "Tree",
        "features": [
          {
            "name": "Family tree",
            "tags": [],
            "what": "A zoomable tree of your family. Tap a person for their profile and stories; add a father, mother, sibling, spouse or child from their panel.",
            "how": "Family → Tree. Start with \"Add my household to the tree\" to place everyone in one tap, then add parents and grandparents.",
            "pros": [
              "Children learn who their titos and lolas are.",
              "Each person links to their stories and profile."
            ],
            "cons": [],
            "tips": [
              "start with \"Add my household to the tree\", then import a tree file for the wider clan."
            ]
          },
          {
            "name": "Tree file import and export (GEDCOM)",
            "tags": [
              "plus"
            ],
            "what": "Bring in a family tree from MyHeritage, Ancestry or another app as a .ged file, or take yours out.",
            "how": "Family → Tree → Tree file. Choose a .ged file; you see who is in it and who is already on your tree before anything is added.",
            "pros": [
              "A 60-person tree goes in without typing.",
              "Nothing is added until you have checked it."
            ],
            "cons": [
              "Needs Plus; the tree itself stays free."
            ],
            "tips": []
          },
          {
            "name": "Linked households, matches and invites",
            "tags": [
              "link"
            ],
            "what": "Colours show where each person is on Kin: your household, a linked one, or \"name only\" with an invite. When two linked trees share a person, Kin offers to join them.",
            "how": "Link a household with its invite code (Settings → Household), then invite \"name only\" relatives from their panel.",
            "pros": [
              "The whole clan builds one tree together.",
              "Relatives' pages, the Family Feed and the Family chat come with the link."
            ],
            "cons": [
              "Needs a second household on Kin. Tip: share your invite code with Lola's household first."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Links",
        "features": [
          {
            "name": "Shared costs with linked households",
            "tags": [
              "link"
            ],
            "what": "A shared pot with another household for a cost you split, like Lola's care or a parent's medicine, in parts (1 and 1 is half each; 2 and 1 is two thirds and one third).",
            "how": "Family → Shared costs → start one with a household you are linked to.",
            "pros": [
              "Siblings see who has paid their share without awkward messages."
            ],
            "cons": [
              "Grown-ups only, and only while both households stay linked."
            ],
            "tips": []
          },
          {
            "name": "Emergency contacts",
            "tags": [],
            "what": "The numbers that matter: the grown-ups from their profiles, plus the barangay, the hospital, the pedia.",
            "how": "Family → Links → add a contact.",
            "pros": [
              "SOS and the emergency card read from this list."
            ],
            "cons": [],
            "tips": [
              "add the barangay, the nearest hospital and the pedia; SOS reads from this list."
            ]
          },
          {
            "name": "Smart home shortcuts",
            "tags": [],
            "what": "Buttons that open Xiaomi Home and LG ThinQ.",
            "how": "Family → Links. Tap a tile; on a phone it opens the app or its store page.",
            "pros": [
              "One place to reach the aircon and the vacuum."
            ],
            "cons": [
              "Opens the other app; Kin does not control the devices."
            ],
            "tips": []
          },
          {
            "name": "Where everyone is, saved places, arrivals",
            "tags": [
              "phone"
            ],
            "what": "Each person chooses whether to share where they are. Save Home, School and Work; Kin can tell the family when someone arrives. No trail is kept.",
            "how": "Family → Links. Switch on your own sharing, save places, then turn on Arrivals in Settings → Notifications.",
            "pros": [
              "\"Nakarating na\" without anyone typing it.",
              "Nobody is shown until they switch it on themselves."
            ],
            "cons": [
              "On the web it updates while Kin is open; updates with the app closed come with the phone apps."
            ],
            "tips": []
          }
        ]
      }
    ]
  },
  {
    "id": "chat",
    "name": "Chat",
    "intro": "Messaging with replies, forward, edit, unsend, pins, seen-by, mentions, polls and scheduled messages, where a message can become a task, an event, an expense or a To-Buy item.",
    "groups": [
      {
        "title": "Conversations",
        "features": [
          {
            "name": "Household chat",
            "tags": [],
            "what": "One chat for everyone in the house. Photos, stickers, polls, voice notes, tags, and calls from the header.",
            "how": "Chat → Household. Use it in place of the family group on Messenger.",
            "pros": [
              "Everyone in the house is already in it; nobody has to be added.",
              "Plans made here can be turned into tasks and events (see Make it)."
            ],
            "cons": [],
            "tips": [
              "relatives outside the house use the Family chat."
            ]
          },
          {
            "name": "Make it: a message becomes a task, event, expense or to-buy",
            "tags": [],
            "what": "Any message can be turned into a Planner task, an event, an expense in Wealth or a line on To-Buy, so a plan agreed in chat is not lost.",
            "how": "Long-press a message → Make it → choose what it becomes. \"Pabili ng gatas at itlog\" becomes two To-Buy items.",
            "pros": [
              "Nothing agreed in chat gets forgotten.",
              "No copying between apps."
            ],
            "cons": [],
            "tips": [
              "check the date and amount Kin fills in before saving."
            ]
          },
          {
            "name": "Message tools",
            "tags": [],
            "what": "Reply, forward, edit, unsend, pin, react, mention, polls, scheduled messages and seen-by. Runs of removed messages fold into one line.",
            "how": "Long-press a message for its options; use the + by the text box for polls and scheduling.",
            "pros": [
              "Everything people expect from Messenger or Telegram."
            ],
            "cons": [
              "Unsend removes it for everyone, but it may already have been read."
            ],
            "tips": []
          },
          {
            "name": "Family chat",
            "tags": [
              "link"
            ],
            "what": "A chat across linked households: the Sunday-lunch channel. Pins keep the plan at the top.",
            "how": "Chat → Family, once another household is linked.",
            "pros": [
              "The whole clan in one place, without anyone's phone number.",
              "Pinned plans stay visible."
            ],
            "cons": [
              "Needs a linked household."
            ],
            "tips": []
          },
          {
            "name": "Groups and announcement channels",
            "tags": [],
            "what": "Named groups with chosen members. An announcements-only group lets only admins post.",
            "how": "Chat → New group. Name it, pick members or Everyone, and choose Announcements only if needed.",
            "pros": [
              "A batch or barkada chat without leaving Kin.",
              "Announcements keep family notices from getting buried."
            ],
            "cons": [],
            "tips": [
              "Kin warns when a group name is already used; rename one so they're easy to tell apart."
            ]
          },
          {
            "name": "Direct messages",
            "tags": [],
            "what": "One-to-one chats. New message opens a list of people: your household first, then your other connections.",
            "how": "Chat → New message → pick a person, or \"Connect with someone new\".",
            "pros": [
              "Household grown-ups are ready to message from day one."
            ],
            "cons": [
              "Someone outside the household has to accept your connection first."
            ],
            "tips": []
          },
          {
            "name": "\"What did I miss?\" summary",
            "tags": [
              "ai"
            ],
            "what": "A short summary of a busy chat's unread messages, shown once and not saved.",
            "how": "Open a chat with many unread messages and tap the summary offer at the top.",
            "pros": [
              "Catch up on 80 messages in one paragraph."
            ],
            "cons": [
              "Uses Kin AI (5 a month free, unlimited on Plus)."
            ],
            "tips": []
          },
          {
            "name": "Saved messages",
            "tags": [],
            "what": "A private thread only you see, for notes and forwarded messages.",
            "how": "Chat → Saved messages, or forward any message to yourself.",
            "pros": [
              "A quick private notepad (\"Passport renewal: bring 2 photos\")."
            ],
            "cons": [],
            "tips": [
              "anything with a date belongs in a task, which reminds you."
            ]
          },
          {
            "name": "Search, Albums and Highlights",
            "tags": [],
            "what": "Search across all chats; photos sent in the family chat can be kept in an album; Highlights collect the moments worth keeping.",
            "how": "The search and album buttons in the chat header.",
            "pros": [
              "Find the address someone sent three weeks ago.",
              "Birthday photos end up in one album."
            ],
            "cons": [],
            "tips": [
              "send the birthday photos in chat once and the album makes itself."
            ]
          },
          {
            "name": "Voice and video calls",
            "tags": [
              "phone"
            ],
            "what": "One-to-one calls from a chat header or a member page.",
            "how": "Tap the phone or camera icon. On iPhone, add Kin to the Home Screen so calls ring.",
            "pros": [
              "No phone number or Messenger account needed."
            ],
            "cons": [
              "One-to-one only; no group calls yet.",
              "Calls on mobile data can fail on some networks until Kin's relay service is switched on."
            ],
            "tips": []
          }
        ]
      }
    ]
  },
  {
    "id": "journal",
    "name": "Journal",
    "intro": "A private diary, the household's shared album and a feed relatives can react to, in one place, with letters, cards, a weekly question and a printable year book.",
    "groups": [
      {
        "title": "Entries",
        "features": [
          {
            "name": "Add an entry",
            "tags": [],
            "what": "Words, photos and videos with a date, who was there, and whether it is for the Household Journal or just you. An entry with photos can become a short video with music.",
            "how": "Journal → + . Tag who was there every time.",
            "pros": [
              "Tags fill each person's Moments and help the year book choose pages.",
              "Back-dated entries sort into the right place."
            ],
            "cons": [],
            "tips": [
              "upload long videos on Wi-Fi."
            ]
          },
          {
            "name": "Milestones (★)",
            "tags": [],
            "what": "Mark an entry as someone's milestone: first steps, first day of school, a baptism.",
            "how": "Tick Milestone and choose whose it is when adding an entry.",
            "pros": [
              "Milestones show on the person's page and go into the year book."
            ],
            "cons": [],
            "tips": [
              "backfill the big ones from the camera roll; back-dated entries sort into place."
            ]
          },
          {
            "name": "Sharing: Household, Family Feed, Public",
            "tags": [],
            "what": "Each entry is shared as far as you choose: the household only, the Family Feed for linked relatives, or Public for your connections.",
            "how": "The Share toggle on each entry. The household default is in Settings → Household → \"Share new memories with relatives\".",
            "pros": [
              "You decide entry by entry; the default saves deciding every time."
            ],
            "cons": [],
            "tips": [
              "with the household default on, new entries reach relatives; un-share the odd one."
            ]
          },
          {
            "name": "This week's question, letters and cards",
            "tags": [],
            "what": "A weekly prompt (\"Where did you live when you were ten?\") that starts an entry; a letter that opens on a chosen day; a card that collects everyone's signatures.",
            "how": "Journal → the question card, or + → Letter or Card.",
            "pros": [
              "A card for a birthday gets relatives to open Kin.",
              "A letter to a child can wait years for the day it opens."
            ],
            "cons": [],
            "tips": [
              "start a birthday card a few days early so everyone has time to sign."
            ]
          }
        ]
      },
      {
        "title": "Views",
        "features": [
          {
            "name": "Family Feed",
            "tags": [
              "link"
            ],
            "what": "Entries shared with linked households, with six reactions and comments.",
            "how": "Journal → Family Feed. Link a household with its code from the same screen.",
            "pros": [
              "Lola sees the grandchildren's week without a group chat.",
              "Reactions and comments stay with the memory."
            ],
            "cons": [
              "Needs a linked household."
            ],
            "tips": []
          },
          {
            "name": "Public",
            "tags": [],
            "what": "Moments marked Public by the people you are connected with, and yours. Only grown-ups you are connected with, or linked to on your family tree, see what you share here.",
            "how": "Mark an entry Public in Mine; read others' in Journal → Public.",
            "pros": [
              "A way to share with friends and ninongs who are not family.",
              "Children never see Public entries."
            ],
            "cons": [],
            "tips": [
              "Public reaches every grown-up connection; check before sharing a child's photo."
            ]
          },
          {
            "name": "Year book",
            "tags": [
              "plus"
            ],
            "what": "A printable A4 book of the year's milestones and most-loved photo entries, made on your phone and never stored.",
            "how": "Journal → Year book. Tick the entries, Preview, then Make the PDF.",
            "pros": [
              "A real printed book for the family, made in minutes."
            ],
            "cons": [],
            "tips": [
              "print one page at a photo shop to check before the whole book."
            ]
          },
          {
            "name": "On this day, weekly digest",
            "tags": [],
            "what": "Kin brings back entries from the same day in past years and sends a weekly summary.",
            "how": "Nothing to set; they appear once the journal has history.",
            "pros": [
              "Old memories come back by themselves."
            ],
            "cons": [
              "Appears once the journal has a year behind it."
            ],
            "tips": []
          }
        ]
      }
    ]
  },
  {
    "id": "today",
    "name": "Today",
    "intro": "The home screen: what needs a tap today, four tiles, six add buttons, what is coming, and the people in the house.",
    "groups": [
      {
        "title": "Header",
        "features": [
          {
            "name": "Member avatars and Your card",
            "tags": [],
            "what": "Each person's chip opens how they are: status, battery, where they are if they share it. Your card shows what others see of you.",
            "how": "Tap a chip. Set a status once (\"At work till 6\").",
            "pros": [
              "See who is where without calling."
            ],
            "cons": [],
            "tips": [
              "set a status once and share location on the phones that leave the house."
            ]
          },
          {
            "name": "SOS and \"Are you okay?\" check-ins",
            "tags": [
              "phone"
            ],
            "what": "The red SOS button alerts the household with where you are. A check-in asks one person to reply that they are fine.",
            "how": "Tap SOS in the header. Rehearse once with a grown-up.",
            "pros": [
              "Help is one tap away.",
              "A check-in is calmer than ten missed calls."
            ],
            "cons": [
              "Alerts reach a phone only where notifications are allowed."
            ],
            "tips": [
              "rehearse it once with a grown-up."
            ]
          },
          {
            "name": "Weather",
            "tags": [],
            "what": "Today's weather where the family is.",
            "how": "Appears once someone shares location or saves a Home place.",
            "pros": [
              "Umbrella or not, before school."
            ],
            "cons": [],
            "tips": [
              "save a Home place and the weather appears."
            ]
          },
          {
            "name": "Kin's suggestions",
            "tags": [],
            "what": "One suggestion at a time for something worth setting up, like your first goal.",
            "how": "Take it or Skip.",
            "pros": [
              "Shows the next useful step without a manual."
            ],
            "cons": [
              "One at a time; a skipped one waits a while before it comes back."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "The day",
        "features": [
          {
            "name": "Today: what needs a tap",
            "tags": [],
            "what": "Bills due, check-ups, medicines and chores for today, with Pay, Done or Skip. The heading folds the list to one line, and the phone remembers.",
            "how": "Act on each line, or tap the heading to fold it. Pay opens that bill in Cash Flow.",
            "pros": [
              "The day's to-dos from every tab, in one list."
            ],
            "cons": [],
            "tips": [
              "Skip an item you've handled elsewhere so it stops showing."
            ]
          },
          {
            "name": "At a glance",
            "tags": [],
            "what": "Four tiles: medicines to take today, your goals and targets, the to-buy total, and what was spent this month.",
            "how": "Tap a tile to open it.",
            "pros": [
              "The household's numbers without opening four tabs."
            ],
            "cons": [],
            "tips": [
              "the to-buy total grows more exact as items get prices."
            ]
          },
          {
            "name": "Add buttons",
            "tags": [],
            "what": "Milestone, Event, To buy, Expense, Note, and Nakarating na ako (tells the household you have arrived, in one tap).",
            "how": "Tap a button; each opens the right form.",
            "pros": [
              "Nakarating replaces the \"nasa bahay na ako\" text.",
              "The fastest way to log an expense or a to-buy."
            ],
            "cons": [
              "Six buttons only; anything else is added from its own tab or Ask Kin."
            ],
            "tips": []
          },
          {
            "name": "Coming up",
            "tags": [],
            "what": "Birthdays, events and plans ahead, with a Who filter. The week a managed child turns 13, grown-ups see that they can have a login of their own.",
            "how": "Tap an event to open it; its row already says how many are coming and bringing food.",
            "pros": [
              "Nobody forgets a birthday."
            ],
            "cons": [],
            "tips": [
              "the row shows who is coming and who brings food; tap it for the event."
            ]
          },
          {
            "name": "Christmas on Today",
            "tags": [],
            "what": "From 1 December to 1 January: the sleeps to Noche Buena, a ready Noche Buena plan, the gift list and the monito-monita at the top of Today.",
            "how": "Appears by itself in December; a grown-up can turn it off in the household's settings.",
            "pros": [
              "The Noche Buena plan fills To-Buy in one tap.",
              "Gifts, monito and the menu in one place."
            ],
            "cons": [
              "Only from 1 December to 1 January."
            ],
            "tips": []
          },
          {
            "name": "Your family's week",
            "tags": [],
            "what": "This week's posts and photos and next week's plans, with Philippine holidays.",
            "how": "Open it on Sunday evening with the week-ahead notification.",
            "pros": [
              "The week in one screen."
            ],
            "cons": [
              "Only as full as the calendar and journal behind it."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Everywhere",
        "features": [
          {
            "name": "Ask Kin",
            "tags": [
              "ai"
            ],
            "what": "The floating button on every screen. Ask in English or Taglish to find something, see the schedule or money, or add a task, bill, event, goal, entry or meal plan.",
            "how": "Tap the button and type or speak.",
            "pros": [
              "Adding something takes one sentence.",
              "Answers questions across every tab."
            ],
            "cons": [
              "Kin AI: 5 uses a month on Free, unlimited on Plus."
            ],
            "tips": []
          },
          {
            "name": "Guided tour",
            "tags": [],
            "what": "A short walk through the app.",
            "how": "Settings → A quick tour of Kin.",
            "pros": [
              "The best first five minutes for a new grown-up."
            ],
            "cons": [
              "Covers the main tabs only."
            ],
            "tips": []
          }
        ]
      }
    ]
  },
  {
    "id": "planner",
    "name": "Planner",
    "intro": "The family calendar, tasks and chores, events with gifts and monito-monita, and goals with targets, coins, badges and a shop.",
    "groups": [
      {
        "title": "Calendar",
        "features": [
          {
            "name": "Week and month views, Who filter, layers",
            "tags": [],
            "what": "The family calendar with layers you can switch off: tasks, chores, events and travel, bills, meals, goals and Philippine holidays.",
            "how": "Planner → Calendar. Tap the Who chip for Family; hold it for everyone.",
            "pros": [
              "Everything with a date, from every tab, in one calendar.",
              "Chores fold into one line a day."
            ],
            "cons": [],
            "tips": [
              "tap the ▾ beside the Who chip to see everyone at once."
            ]
          },
          {
            "name": "Add a task or event, flyer scan",
            "tags": [
              "ai"
            ],
            "what": "Title, date, time, repeat, who it is for, place and notes. A photo of a school memo or invitation can fill in the dates.",
            "how": "Planner → + , or Today → Event.",
            "pros": [
              "One form for both tasks and events.",
              "The photo stays attached to the event."
            ],
            "cons": [
              "Reading dates from a photo uses Kin AI; without it, the photo is kept and you type the dates."
            ],
            "tips": []
          },
          {
            "name": "Google Calendar sync and calendar subscription",
            "tags": [
              "setup"
            ],
            "what": "Tasks and events go to each person's Google Calendar, so reminders reach their phone. A subscription link works for Apple Calendar and Outlook.",
            "how": "Settings → Connected apps → Google Calendar, for each grown-up.",
            "pros": [
              "Reminders arrive on the phone like any calendar alert.",
              "Works with the calendar people already use."
            ],
            "cons": [
              "Each grown-up connects their own Google account."
            ],
            "tips": [
              "without it, reminders stay inside Kin."
            ]
          }
        ]
      },
      {
        "title": "Tasks and chores",
        "features": [
          {
            "name": "Add a task: templates, repeat, reminder, coins, usual cost",
            "tags": [],
            "what": "Start from a template (Weekly grocery, Sunday mass, Gym days, House clean) or from scratch. Set the days, a reminder, who it is for, coins for a child, and a usual cost that goes to the ledger when it is done.",
            "how": "Planner → Tasks → Add a task.",
            "pros": [
              "A task with a usual cost records the expense when ticked done.",
              "Repeats weekly or every few weeks on chosen days."
            ],
            "cons": [],
            "tips": [
              "start from a template; a usual cost logs the expense when the task is done."
            ]
          },
          {
            "name": "Task list",
            "tags": [],
            "what": "What is planned, who it is for and how often, with each chore's coins on its line and, for grown-ups, how many chores wait for approval.",
            "how": "Planner → Tasks. Tap a task to change it.",
            "pros": [
              "Every repeating job in one list."
            ],
            "cons": [],
            "tips": [
              "the coins line says how many chores wait for your approval; tap it for the Shop."
            ]
          }
        ]
      },
      {
        "title": "Events",
        "features": [
          {
            "name": "Events: birthdays, Who's coming, potluck, thread",
            "tags": [],
            "what": "Birthdays and anniversaries repeat each year by themselves. Each event has Who's coming, a potluck list and its own chat thread.",
            "how": "Planner → Events → + Add event. Open an event to start Who's coming, and share its guest link with relatives who are not on Kin: they type their name and say if they are coming and what they will bring.",
            "pros": [
              "Plans, headcount and the potluck in one place."
            ],
            "cons": [
              "Guests by link type their own names, so check for doubles."
            ],
            "tips": []
          },
          {
            "name": "Christmas gifts and aguinaldo",
            "tags": [],
            "what": "A budget for each person and inaanak, ticked when bought.",
            "how": "Planner → Events → Christmas gifts and aguinaldo.",
            "pros": [
              "The whole Christmas list and its total in one place."
            ],
            "cons": [],
            "tips": [
              "tick a gift Bought and press Record to log what it cost in Wealth (Plus)."
            ]
          },
          {
            "name": "Monito-monita",
            "tags": [],
            "what": "Draw names for the gift exchange.",
            "how": "Planner → Events → Monito-monita. Start a draw: your whole household is in; take out anyone not playing, ask linked households in, then draw.",
            "pros": [
              "A fair draw without paper slips."
            ],
            "cons": [],
            "tips": [
              "the whole household starts in the draw; take out anyone not playing before drawing."
            ]
          }
        ]
      },
      {
        "title": "Goals and the game",
        "features": [
          {
            "name": "Goals",
            "tags": [],
            "what": "Money, water, steps, weight, gym, or anything else, for a person or the household, with who can see it. A goal can carry a promised reward, which Kin treats as binding and keeps reminding about until it is given.",
            "how": "Planner → Goals → New goal.",
            "pros": [
              "Goals become the targets children earn coins from.",
              "A promised reward is never quietly forgotten."
            ],
            "cons": [
              "A promised reward can't be dropped; promise carefully."
            ],
            "tips": []
          },
          {
            "name": "Target",
            "tags": [],
            "what": "Goal targets earn XP and coins when met; each child has a Play view of their own progress.",
            "how": "Planner → Goals → 🎯 Target.",
            "pros": [
              "Children see progress, not just a to-do list."
            ],
            "cons": [
              "Needs at least one goal before there is anything to earn."
            ],
            "tips": []
          },
          {
            "name": "Badges",
            "tags": [],
            "what": "23 badges for meeting targets, given the moment they are earned.",
            "how": "Planner → Goals → Badges.",
            "pros": [
              "Small wins children can collect."
            ],
            "cons": [],
            "tips": [
              "a badge arrives the moment it's earned; a child's after a grown-up approves the claim."
            ]
          },
          {
            "name": "🪙 Shop: rewards, streak bonus, approvals",
            "tags": [],
            "what": "Each child's coins and history, the rewards they can spend them on, a streak bonus, and the approvals for chores and reward requests.",
            "how": "Planner → Goals → 🪙 Shop. Add two rewards before the first chore.",
            "pros": [
              "Children work toward something they chose.",
              "Approvals are all in one place."
            ],
            "cons": [
              "A child's chore counts only once a grown-up approves it."
            ],
            "tips": []
          },
          {
            "name": "Alkansya",
            "tags": [],
            "what": "Each child's weekly baon and the coins they change into pesos, split into gastos, ipon and bigay. A record of cash kept at home; Kin moves no real money.",
            "how": "Planner → Goals → 🪙 Shop → Alkansya. Set the baon, the split and a peso value per coin.",
            "pros": [
              "Teaches saving and giving, not just spending.",
              "Chores and baon become one system."
            ],
            "cons": [
              "Kin keeps the record; a parent hands over the cash."
            ],
            "tips": []
          },
          {
            "name": "Set up",
            "tags": [],
            "what": "Which goals count as targets, and new steps targets.",
            "how": "Planner → Goals → Set up.",
            "pros": [
              "Grown-ups decide what earns coins."
            ],
            "cons": [],
            "tips": [
              "keep coin values small and even so Shop prices stay easy to read."
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "household",
    "name": "Household",
    "intro": "The running of the house: a shopping list that knows prices and market sections, and a meal planner that writes the list.",
    "groups": [
      {
        "title": "To-Buy",
        "features": [
          {
            "name": "The list",
            "tags": [],
            "what": "Everything to buy, with a running total, what is in the basket, a shopping day and sections in the order you walk the market. Works offline.",
            "how": "Household → To-Buy. Set a shopping day; type the price at the till.",
            "pros": [
              "Prices typed while shopping fill the price book, so the totals get better each week.",
              "Everyone in the house adds to the same list."
            ],
            "cons": [],
            "tips": [
              "type the price at the till once; the price book fills itself from then on."
            ]
          },
          {
            "name": "Add an item",
            "tags": [],
            "what": "Quantity, unit, market section, and \"for an event\" (like a birthday). Common Filipino groceries are filed in the right section by their name.",
            "how": "Household → To-Buy → +.",
            "pros": [
              "Items for a party stay grouped under that event."
            ],
            "cons": [],
            "tips": [
              "move an item Kin filed in Other once; next time that name goes to the same section."
            ]
          },
          {
            "name": "Loyalty cards, prices and pantry",
            "tags": [],
            "what": "Store cards as barcodes, a price book per store, and pantry stock that the grocery list skips.",
            "how": "Household → Cards, or Prices & pantry.",
            "pros": [
              "No more wallet full of cards.",
              "The meal plan buys only what is missing."
            ],
            "cons": [],
            "tips": [
              "update the pantry after a big shop so the meal plan buys only what's missing."
            ]
          },
          {
            "name": "Add by voice, from chat, or by the helper",
            "tags": [
              "phone"
            ],
            "what": "\"Hey Siri, Add to Kin\" (up to 20 items), a chat message turned into to-buy, or the helper's own link.",
            "how": "Set up Siri in Settings → Action Button & widget; make the helper link in Settings → Household.",
            "pros": [
              "The yaya sees and ticks the list without an account.",
              "Medicine refills appear without the medicine's name."
            ],
            "cons": [
              "\"Hey Siri\" needs an iPhone."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Meals",
        "features": [
          {
            "name": "Meal plan and Generate grocery list",
            "tags": [],
            "what": "Five slots a day (breakfast, two snacks, lunch, dinner) from a recipe book. Generate grocery list takes the week's ingredients, skips what is in the house and prices each one.",
            "how": "Household → Meals. Plan dinners for the week (or Copy last week's meals), then press Generate grocery list.",
            "pros": [
              "One action writes the week's list with sections and costs."
            ],
            "cons": [],
            "tips": [
              "plan one week, then \"Copy last week's meals\" when the next week is the same."
            ]
          },
          {
            "name": "Recipes, from a link, cook-from-pantry, meal cost",
            "tags": [],
            "what": "Save a recipe from a website link, see what you can cook from what is in the pantry, and the cost of each meal.",
            "how": "Household → Meals → add a meal or paste a recipe link.",
            "pros": [
              "Favourite recipes from Panlasang Pinoy in one place.",
              "Shows what each meal costs."
            ],
            "cons": [
              "Costs appear once the price book has the ingredients."
            ],
            "tips": []
          }
        ]
      }
    ]
  },
  {
    "id": "wealth",
    "name": "Wealth",
    "intro": "Money in and out, accounts, bills, budgets, net worth, utang, paluwagan and remittances. Private accounts stay private, even from the rest of the household. Wealth is part of Kin Plus.",
    "groups": [
      {
        "title": "Cash Flow",
        "features": [
          {
            "name": "Monthly cash flow and budgets",
            "tags": [
              "plus"
            ],
            "what": "This month's net (\"More went out than came in\") against last month, a 12-month chart of money in and out, and budgets per category.",
            "how": "Wealth → Cash Flow. Set budgets on the categories that move: groceries, utilities, school.",
            "pros": [
              "See the month's direction at a glance.",
              "Each bar shows in, out and budget."
            ],
            "cons": [
              "Only as accurate as what is logged. Tip: set budgets on the three categories that move."
            ],
            "tips": []
          },
          {
            "name": "Income",
            "tags": [
              "plus"
            ],
            "what": "A chart of where money comes from, regular income grouped by source, and utang coming back to you.",
            "how": "Wealth → Cash Flow → Income. Add income with + ; remittances and utang are added from the same sheet.",
            "pros": [
              "Shows which income the household depends on.",
              "Instalments owed to you appear when due."
            ],
            "cons": [
              "Income not yet logged shows as \"not logged yet\"; press Received when it lands."
            ],
            "tips": []
          },
          {
            "name": "Bills and subscriptions",
            "tags": [
              "plus"
            ],
            "what": "Repeating charges and income with what they cost a month and a year. Bills are paid from an account; paying a repeating bill offers to add the next one; \"Paid outside Kin\" clears one paid elsewhere.",
            "how": "Wealth → Cash Flow → bills, or Subscriptions. Pay from Today or here.",
            "pros": [
              "Bills are reminded three days before.",
              "The yearly cost of subscriptions is plain to see."
            ],
            "cons": [],
            "tips": [
              "paying a repeating bill offers the next one; tap to accept it."
            ]
          },
          {
            "name": "Monthly recap",
            "tags": [
              "plus"
            ],
            "what": "Last month against its budget: spending, bills and savings, and how net worth changed.",
            "how": "Wealth → Monthly recap; step back month by month.",
            "pros": [
              "One page to review money together once a month."
            ],
            "cons": [
              "A month shows once it has ended."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Accounts and A&L",
        "features": [
          {
            "name": "Accounts",
            "tags": [
              "plus"
            ],
            "what": "Every bank, e-wallet and cash account with a combined total, a chart by owner, the cash trend and recent activity. Private accounts can be left out of the totals.",
            "how": "Wealth → Accounts. Add each account once with its balance.",
            "pros": [
              "All the money in one view.",
              "Private accounts never leave your own view."
            ],
            "cons": [
              "No bank sync: balances move with what is logged in Kin. Tip: use the pending step for GCash."
            ],
            "tips": []
          },
          {
            "name": "Net worth: assets and liabilities",
            "tags": [
              "plus"
            ],
            "what": "What you own less what you owe, by owner. An asset can hold what is inside it (furniture, appliances, renovation), each changing in value on its own; loans carry their schedules.",
            "how": "Wealth → A&L. Add the house and car once with a yearly change in value.",
            "pros": [
              "Net worth moves by itself after the first entry.",
              "Loans show what is left to pay."
            ],
            "cons": [
              "The line draws once there are two months."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Moving money",
        "features": [
          {
            "name": "Move money: in, out, transfer",
            "tags": [
              "plus"
            ],
            "what": "Log money in, out or between accounts, with the source and particulars. For GCash and bank apps, \"Open app & log it\" holds it as pending until you confirm it went through. A receipt or screenshot can fill the form.",
            "how": "Wealth → + , or Today → Expense.",
            "pros": [
              "The pending step keeps balances honest without bank sync."
            ],
            "cons": [],
            "tips": [
              "snap the receipt instead of typing (Kin AI)."
            ]
          },
          {
            "name": "Snap a receipt or GCash screenshot",
            "tags": [
              "plus",
              "ai"
            ],
            "what": "Take a photo of a receipt or a GCash screenshot and Kin fills in the amount, date and particulars.",
            "how": "Wealth → Snap a receipt or GCash screenshot, check the details, then save.",
            "pros": [
              "No typing at the till."
            ],
            "cons": [
              "Uses Kin AI; check the amount before saving."
            ],
            "tips": []
          },
          {
            "name": "Money goals",
            "tags": [
              "plus"
            ],
            "what": "Save toward a target in a real account, joint or yours, with a date. It appears on everyone's calendar.",
            "how": "Planner → Goals → New goal → Money, and choose where it is saved.",
            "pros": [
              "Contributions come out of a real account, so the progress is real."
            ],
            "cons": [
              "Kin keeps the record; the money stays in your account."
            ],
            "tips": []
          },
          {
            "name": "Utang and paluwagan",
            "tags": [
              "plus"
            ],
            "what": "Who owes whom, paid back at once or in 2 to 120 instalments (weekly, kinsenas or monthly), each marked overdue on its own. A paluwagan with its turns and who has paid each round.",
            "how": "Wealth → Cash Flow → Add income → Utang. Kin writes a polite reminder for you to send yourself.",
            "pros": [
              "Replaces the sheet of paper for the office paluwagan.",
              "Children never see it; Just me hides an entry from the household."
            ],
            "cons": [
              "Kin never contacts the other person; you send the reminder it writes."
            ],
            "tips": []
          },
          {
            "name": "Remittances",
            "tags": [
              "plus"
            ],
            "what": "Money sent home: from whom, in which of 20 currencies, the pesos that arrived, how it came, and what it went to.",
            "how": "Wealth → Cash Flow → Add income → Remittance. Log the pesos that actually arrived.",
            "pros": [
              "The family abroad sees what came home and where it went."
            ],
            "cons": [],
            "tips": [
              "log the pesos that actually arrived; the rate shown is a reference only."
            ]
          },
          {
            "name": "Statement import (CSV)",
            "tags": [
              "plus"
            ],
            "what": "Bring in a month of transactions from a bank or GCash CSV or PDF export.",
            "how": "Wealth → Accounts → an account → Import.",
            "pros": [
              "Fills months of history in one go."
            ],
            "cons": [
              "Reading a PDF statement uses Kin AI; a CSV works without it."
            ],
            "tips": []
          }
        ]
      }
    ]
  },
  {
    "id": "settings",
    "name": "Settings",
    "intro": "Reached from the gear on Today. Most of the app's reach is switched on here: calendars, Drive, notifications, the helper link and the vault lock.",
    "groups": [
      {
        "title": "Switches",
        "features": [
          {
            "name": "Connected apps",
            "tags": [
              "setup"
            ],
            "what": "Google Calendar (each person), Google Drive (the organizer), a calendar subscription link, and Apple Health.",
            "how": "Settings → Connected apps. Connect Calendar for every grown-up, then Drive.",
            "pros": [
              "Calendar puts reminders on phones; Drive keeps vault files in your own storage."
            ],
            "cons": [
              "Each grown-up connects their own Calendar."
            ],
            "tips": []
          },
          {
            "name": "Notifications",
            "tags": [
              "phone"
            ],
            "what": "Twelve kinds you can switch on or off: events, health, bills, journal, shopping, chat, calls, family calls, chores to approve, letters and cards, arrivals and the week ahead.",
            "how": "Settings → Notifications. On iPhone, add Kin to the Home Screen first, then allow notifications.",
            "pros": [
              "Choose exactly what buzzes."
            ],
            "cons": [
              "On iPhone they work once Kin is on the Home Screen."
            ],
            "tips": []
          },
          {
            "name": "Action Button, widget and Siri",
            "tags": [
              "phone"
            ],
            "what": "A pop-up menu for the Action Button, Home Screen buttons, \"Today in Kin\" read aloud and \"Add to Kin\" by voice.",
            "how": "Settings → Action Button & widget, and follow the five steps (about five minutes).",
            "pros": [
              "Add to the list without opening the app."
            ],
            "cons": [
              "iPhone only, set up on each phone."
            ],
            "tips": []
          },
          {
            "name": "Appearance",
            "tags": [],
            "what": "Light, dark or system, 16 colour themes including High contrast, and text size.",
            "how": "Settings → Appearance.",
            "pros": [
              "High contrast with large text suits Lolo and Lola."
            ],
            "cons": [],
            "tips": [
              "the theme follows your account to every phone."
            ]
          }
        ]
      },
      {
        "title": "The household",
        "features": [
          {
            "name": "Household settings",
            "tags": [],
            "what": "Name, invite code and QR, organizer handover, sharing with relatives, currency, date format, week start, country and time zone, special days, helpers, moving and deleting the household.",
            "how": "Settings → Household. Set Country to Philippines; add the town fiesta under Special days.",
            "pros": [
              "Country sets the holidays, currency and vaccine schedule together."
            ],
            "cons": [
              "Only the organizer transfers or deletes the household."
            ],
            "tips": []
          },
          {
            "name": "Helper access",
            "tags": [],
            "what": "A link for the kasambahay or driver, with switches for To-Buy, Meals and Family plans. No account needed.",
            "how": "Settings → Household → Helpers → make a link; print the QR for the kitchen.",
            "pros": [
              "The helper sees only what you switch on.",
              "Removing the link ends access at once."
            ],
            "cons": [
              "Anyone with the link can open it; keep it to the helper, and remove it the day they leave."
            ],
            "tips": []
          },
          {
            "name": "Privacy & lock, emergency access",
            "tags": [
              "phone"
            ],
            "what": "The vault PIN or Face ID, and emergency access: someone you trust can ask to read the vault after a wait you choose (1, 3 or 7 days). Drive documents are not included.",
            "how": "Settings → Privacy & lock.",
            "pros": [
              "The family can reach the papers if something happens to you."
            ],
            "cons": [],
            "tips": [
              "you can refuse a request during the wait, so keep notifications on."
            ]
          },
          {
            "name": "Your plan: Kin Free and Kin Plus",
            "tags": [],
            "what": "Free: calendar, chores, baon, list and meals, chat and calls, journal (1 GB), tree, health profiles and the emergency card, 5 Kin AI uses a month. Plus (₱149 a month or ₱1,490 a year): Wealth, utang and paluwagan, the vault, medicines and vitals, unlimited Kin AI, 50 GB.",
            "how": "Settings → Your plan.",
            "pros": [
              "Everything a family needs every day is free."
            ],
            "cons": [
              "Money, documents and medicines need Plus."
            ],
            "tips": []
          },
          {
            "name": "Account",
            "tags": [],
            "what": "Sign out, Download my data (spreadsheets in a ZIP, behind your password), Delete my account with 7 days to change your mind, and the legal pages.",
            "how": "Settings → Account. To delete, type the words shown; sign in within 7 days to keep the account.",
            "pros": [
              "Your data is yours to take.",
              "A deletion can be undone for a week."
            ],
            "cons": [
              "The last grown-up's deletion takes the household too, unless another grown-up is invited first. Children's profiles stay."
            ],
            "tips": []
          },
          {
            "name": "Kid view",
            "tags": [],
            "what": "A simpler Kin for children with their own login, of any age once a parent approves it: their jobs, coins, rewards and what is coming, plus Chat, Journal, the tree and their own theme. Money, vault, health and household settings are hidden.",
            "how": "A child who joins with the household's code and is approved as a child opens in kid view; a grown-up can switch it in Settings → Kid view.",
            "pros": [
              "Children use Kin without seeing the family's money or papers."
            ],
            "cons": [
              "For children with a login of their own; younger ones stay managed profiles a parent writes."
            ],
            "tips": []
          }
        ]
      }
    ]
  }
];
