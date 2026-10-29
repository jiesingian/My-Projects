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
            "what": "One page per person. Moments gathers every journal entry they were in; About holds school, work, sizes (shoe, shirt, pants), contact details and ID numbers (SSS, PhilHealth, Pag-IBIG, TIN).",
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
            "how": "Open a member page or a person on the tree → Stories. Press record and let Grandma talk.",
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
            "what": "Your own code and share link for people outside the household: friends, godparents, relatives. A connection lets you message them and see what they mark Public.",
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
              "A grown-up hears about a missed dose for Grandpa's maintenance medicine."
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
            "how": "Family → Health → Emergency card. Fill the blanks, then Share or Print for the nanny, the school or your wallet.",
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
              "connect Google Drive so files stay in your own Drive and not in the household's storage.",
              "an empty folder can be deleted from the foot of its page."
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
              "Needs a second household on Kin."
            ],
            "tips": [
              "share your invite code with Grandma's household first."
            ]
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
            "what": "A shared pot with another household for a cost you split, like Grandma's care or a parent's medicine, in parts (1 and 1 is half each; 2 and 1 is two thirds and one third).",
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
            "what": "The numbers that matter: the grown-ups from their profiles, plus the district office, the hospital, the pediatrician.",
            "how": "Family → Links → add a contact.",
            "pros": [
              "SOS and the emergency card read from this list."
            ],
            "cons": [],
            "tips": [
              "add the district office, the nearest hospital and the pediatrician; SOS reads from this list."
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
              "\"I've arrived\" without anyone typing it.",
              "Nobody is shown until they switch it on themselves."
            ],
            "cons": [
              "On the web it updates while Kin is open; updates with the app closed come with the phone apps."
            ],
            "tips": []
          }
        ]
      },
      {
        "title": "Get ready",
        "features": [
          {
            "name": "Typhoon mode and the go-bag checklist",
            "tags": [],
            "what": "For typhoons and long brownouts: a checklist the whole household ticks together (water, food, light, power banks, medicines, papers in a waterproof bag, cash), and Typhoon mode, which puts the checklist, the emergency card and \"Ask everyone if they're okay\" at the top of Today until it passes.",
            "how": "Family → Get ready for typhoons. Start the checklist and make it fit your home; a grown-up switches Typhoon mode on when a storm is coming and off when it has passed.",
            "pros": [
              "Everyone sees what is still missing, and who ticked what.",
              "One tap asks everyone with Kin on a phone if they're okay.",
              "A brownout goes on the calendar from the same page."
            ],
            "cons": [
              "Switched on by hand: Kin doesn't read PAGASA signals or class suspensions yet."
            ],
            "tips": [
              "get the checklist done at the start of the rainy season, not the night before a storm."
            ]
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
            "how": "Long-press a message → Make it → choose what it becomes. \"Buy milk and eggs\" becomes two To-Buy items.",
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
              "A chat with friends or batchmates without leaving Kin.",
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
            "what": "A short summary of a busy chat's unread messages, shown once and not saved. Quick look, free on every plan and without Kin AI, lists who wrote how much, the questions, and where you were named.",
            "how": "Open a chat with many unread messages and tap the summary offer at the top.",
            "pros": [
              "Catch up on 80 messages in one paragraph."
            ],
            "cons": [
              "The written summary uses Kin AI (Kin Plus); Quick look is free but only lists, it doesn't summarise."
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
              "Grandma sees the grandchildren's week without a group chat.",
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
              "A way to share with friends and godparents who are not family.",
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
            "what": "The red SOS button alerts the household with where you are. A check-in asks one person to reply that they are fine. Once sent, \"Text them too\" opens your messages app addressed to the grown-ups, with the words and where you are already in it.",
            "how": "Tap SOS in the header. Rehearse once with a grown-up.",
            "pros": [
              "Help is one tap away.",
              "A check-in is calmer than ten missed calls.",
              "A text reaches a phone with notifications off or no data."
            ],
            "cons": [
              "The alert itself reaches a phone only where notifications are allowed; the text needs the grown-ups' mobile numbers in their profiles."
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
            "what": "Everything for today from every tab, one line each with its button on the right: bills and credit cards due (Pay), medicines for the people you give them to (Taken), chores, check-ups, RSVPs answered on the row, a vault request, an open SOS, documents running out, cards to sign, trips under way, and a transfer still waiting on \"it went through\" (Confirm). The first five show, the rest wait behind \"Show N more\", and what's answered folds into one \"N done today\" line. Once a month it also lists assets whose value was last set over a year ago.",
            "how": "Act on each line; open \"N done today\" to Undo. Tap the heading to fold the list to one line, and the phone remembers.",
            "pros": [
              "The day's to-dos from every tab, in one short list.",
              "Answered lines get out of the way but stay a tap from Undo."
            ],
            "cons": [],
            "tips": [
              "Skip an item you've handled elsewhere so it stops showing."
            ]
          },
          {
            "name": "At a glance",
            "tags": [],
            "what": "Four tiles: This week (how many things Coming up holds), Goals (\"2 of 3 · targets today\"), To buy (tonight's shortfall for the meal plan and the list's total) and Money (spent this month, plus the week's unpaid bills when no budget is set).",
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
            "what": "The Quick add row: Milestone · Event · Expense · Note until you pick your own (up to four, from the same list as the Action Button and widget), and I've arrived, which tells the household you have arrived in one tap. The type-it line also reads an expense (\"paid Meralco 2300\") and a meal, and opens the form already filled in.",
            "how": "Tap a button, or type a line. Settings → Action Button & widget → Today's Quick add to choose your own.",
            "pros": [
              "I've arrived replaces the \"I'm home now\" text.",
              "The fastest way to log an expense or a to-buy."
            ],
            "cons": [
              "Four picks at a time; anything else is added from its own tab or Ask Kin."
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
            "what": "From 1 December to 1 January: the sleeps to Christmas Eve, a ready Christmas Eve plan, the gift list and the gift exchange at the top of Today.",
            "how": "Appears by itself in December; a grown-up can turn it off in the household's settings.",
            "pros": [
              "The Christmas Eve plan fills To-Buy in one tap.",
              "Gifts, the exchange and the menu in one place."
            ],
            "cons": [
              "Only from 1 December to 1 January."
            ],
            "tips": []
          },
          {
            "name": "Your family's week",
            "tags": [],
            "what": "This week's posts and photos and next week's plans, with your country's holidays.",
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
            "what": "The floating button on every screen. Ask to find something, see the schedule or money, or add a task, bill, event, goal, entry or meal plan. The household's own questions Kin answers by itself from its records: when a bill is due, what's due this week, what was spent on groceries this month, what's left in the budget, an account's balance, what's on today or tomorrow, what's for dinner, what's on the list, who is in the family, a birthday, and (for a grown-up) someone's allergy or medicines; also a goal's progress, loans and lending, subscriptions, a document's expiry, the day's chores and whose turn it is, a child's piggy bank and points, who is coming to an event, any past month's spending, the journal on this day, where something is, and whether something is in the pantry; adds too: \"Add milk to the list\", \"Add Lia dentist tomorrow 9am\", \"Add dinner adobo tomorrow\", \"Add Meralco bill 3200 due Nov 15\". Marks too: \"paid Meralco from GCash\", \"bought milk\", \"Lia did the dishes\". A detail missing, Kin asks for just that one. Those cost nothing and send nothing anywhere. Anything else goes to Kin AI. Kin always replies in English.",
            "how": "Tap the button and type or speak.",
            "pros": [
              "Adding something takes one sentence.",
              "Answers questions across every tab.",
              "The household's own questions are answered from its records in under a second, with nothing sent anywhere."
            ],
            "cons": [
              "Kin AI, for everything the records alone can't answer: 5 uses a month on Free, unlimited on Plus."
            ],
            "tips": [
              "Ask the way you'd text a relative: \"When is Meralco due?\", \"How much did we spend on groceries this month?\", \"What's on tomorrow?\".",
              "on Kin Free, the line under the box says how many Kin AI questions are left this month."
            ]
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
    "intro": "The family calendar, tasks and chores, events with gifts and the gift exchange, and goals with targets, coins, badges and a shop.",
    "groups": [
      {
        "title": "Calendar",
        "features": [
          {
            "name": "Week and month views, Who filter, layers",
            "tags": [],
            "what": "The family calendar with layers you can switch off: tasks, chores, events and travel, bills, meals, goals and your country's holidays.",
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
            "tips": [
              "on Kin Free, the line under the scanner says how many Kin AI uses are left this month."
            ]
          },
          {
            "name": "Google Calendar sync and calendar subscription",
            "tags": [
              "setup"
            ],
            "what": "Tasks and events go to each person's Google Calendar, so reminders reach their phone. A subscription link works for Apple Calendar and Outlook. Each grown-up chooses whether the events pulled from their Google Calendar are the whole family's or just theirs.",
            "how": "Settings → Connected apps → Google Calendar, for each grown-up.",
            "pros": [
              "Reminders arrive on the phone like any calendar alert.",
              "Works with the calendar people already use."
            ],
            "cons": [
              "Each grown-up connects their own Google account."
            ],
            "tips": [
              "without it, reminders stay inside Kin.",
              "leave \"Show my Google events to the whole family\" on so the other grown-up's Today shows them too."
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
            "cons": [],
            "tips": [
              "a guest who answered twice under two spellings is marked \"Same person as …?\"; take one off with ×."
            ]
          },
          {
            "name": "Christmas gifts and cash gifts",
            "tags": [],
            "what": "A budget for each person and godchild, ticked when bought.",
            "how": "Planner → Events → Christmas gifts and cash gifts.",
            "pros": [
              "The whole Christmas list and its total in one place."
            ],
            "cons": [],
            "tips": [
              "tick a gift Bought and press Record to log what it cost in Wealth (Plus)."
            ]
          },
          {
            "name": "Gift exchange",
            "tags": [],
            "what": "Draw names for the gift exchange.",
            "how": "Planner → Events → Gift exchange. Start a draw: your whole household is in; take out anyone not playing, ask linked households in, then draw.",
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
            "what": "Money, water, steps, weight, gym, or anything else, for a person or the household, with who can see it. A goal can carry a promised reward, which Kin treats as binding and keeps reminding about until it is given. A money goal here is also a savings goal on Wealth, and the other way round; editing either keeps them the same.",
            "how": "Planner → Goals → New goal. The dropdown at the top switches the view, like Who.",
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
            "name": "Piggy bank",
            "tags": [],
            "what": "Each child's weekly allowance and the coins they change into money, split into Spend, Save and Give. A record of cash kept at home; Kin moves no real money.",
            "how": "Planner → Goals → 🪙 Shop → Piggy bank. Set the allowance, the split and a value per coin.",
            "pros": [
              "Teaches saving and giving, not just spending.",
              "Chores and allowance become one system."
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
            "what": "Everything to buy, with a budget on each item and, once ticked, what it actually cost and what was saved. A \"Shopping for\" picker narrows it to a kind of store (market, grocery, drugstore, bookstore and more) or an event, grouped by store name or by aisle. Checkout keeps the trip for a week with its Budget / Actual / Savings. Works offline.",
            "how": "Household → To-Buy. Give items a budget; tick them at the till and confirm the price.",
            "pros": [
              "Budget against actual shows what each trip saved.",
              "Prices confirmed at the till fill the price book, so the estimates get better each week.",
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
            "what": "Quantity, unit, budget, market section, kind of store and an optional store name, and \"for an event\" (like a birthday). Common groceries are filed in the right section by their name.",
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
              "The helper sees and ticks the list without an account.",
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
    "intro": "Money in and out, accounts, bills, budgets, net worth, lending, savings circles and remittances. Private accounts stay private, even from the rest of the household. Wealth is part of Kin Plus.",
    "groups": [
      {
        "title": "Cash Flow",
        "features": [
          {
            "name": "Monthly cash flow and budgets",
            "tags": [
              "plus"
            ],
            "what": "This month's net against last month, a chart of money in and out over days, weeks, months or years, and Expenses: a breakdown by category (Market apart from Groceries) and by person (Family first, then each grown-up and child), each category listing its expenses. Under the chart: the next 30 days of bills and the reports.",
            "how": "Wealth → Cash Flow. Tap a category to set, change or remove its budget, for the family or for one person.",
            "pros": [
              "See the month's direction at a glance.",
              "Each bar says what's left or how far over its budget it is.",
              "Budgets per person show who spends on what without a separate sheet."
            ],
            "cons": [
              "Only as accurate as what is logged."
            ],
            "tips": [
              "set budgets on the three categories that move: groceries, utilities, school."
            ]
          },
          {
            "name": "Add expense, edit an entry",
            "tags": [
              "plus"
            ],
            "what": "An expense is \"Already paid\" (it lands at once, on the day it was paid, from the account it came out of) or \"Due later\" (a bill with a date, a repeat from weekly to yearly, and a reminder). Either can say what it was for: a loan it pays down, an asset, or a goal. Any income or expense can be edited or removed from its line in Cash Flow.",
            "how": "Wealth → Cash Flow → Add expense. To fix one, tap its line in Cash Flow → Edit.",
            "pros": [
              "A cash meal is one step, no Settle.",
              "A loan's monthly bill, once paid, lowers the loan.",
              "Moving an entry into an Only-you account keeps it to yourself; such entries say \"· only you\"."
            ],
            "cons": [],
            "tips": [
              "pick the account it was paid from, so the balance stays right without bank sync."
            ]
          },
          {
            "name": "Income",
            "tags": [
              "plus"
            ],
            "what": "A chart of where money comes from, regular income grouped by source, and loans coming back to you.",
            "how": "Wealth → Cash Flow → Income. Add income with + ; remittances and lending are added from the same sheet.",
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
            "what": "Repeating charges (weekly, monthly, quarterly, yearly) and income with what they cost a month and a year. Bills are paid from an account; paying a repeating bill offers to add the next one; \"Paid outside Kin\" clears one paid elsewhere. A bill can be for a loan, asset or goal; settling it pays the loan down. On the bill's day Kin asks whether it went through.",
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
            "what": "Every bank, e-wallet, cash and credit card account, listed by whose then by type, with a combined total, a chart by owner, the cash trend and recent activity. \"Waiting on you\" is one row per transfer still pending, with Went through or Discard, shown only to whoever has to act on it: who logged it, or the owner of its account (every grown-up, for a joint one with nobody named). Cash Flow and A&L have their own: bills due and income come; a loan or holding that needs a look, a yearly fund coming due, a matured deposit, and a shared goal's \"1 / 2\" put in this month, tapped for who has and who has not; Went through lets you correct the amount, day or account first. An account can hold its QR code, shown full-screen for someone to scan and pay in. A credit card takes its due day and minimum payment, and Today reminds you. Private (Only-you) accounts are marked and can be left out of the totals. \"Match the bank\" (\"Count the cash\" on a cash account) takes the figure the bank app shows and records the difference, so Kin's balance agrees again.",
            "how": "Wealth → Accounts. Add each account once with its balance.",
            "pros": [
              "All the money in one view.",
              "Show QR replaces sending a screenshot of your code.",
              "Card due days are reminded like any bill."
            ],
            "cons": [
              "No bank sync: balances move with what is logged in Kin, until you match them to the bank."
            ],
            "tips": [
              "for e-wallets, use the pending step and confirm it under Waiting on you.",
              "in the first three days of each month, Today lists the accounts not matched to their bank lately; the correction isn't counted as income or spending."
            ]
          },
          {
            "name": "Net worth: assets and liabilities",
            "tags": [
              "plus"
            ],
            "what": "What you own less what you owe, by owner, grouped as a balance sheet is: cash and savings (with goals as money set aside), investments, property, vehicles; credit cards count as owed. An asset can hold what is inside it (furniture, appliances, renovation), each changing in value on its own; a house or car bought on a loan goes in with the loan in one entry, and a loan with its terms shows the balance it should have, the interest paid so far and when its fixed rate ends. The line can show days, weeks, months or years, starts at the first figure that isn't zero, and says what moved it since the last period, part by part.",
            "how": "Wealth → A&L. Add the house and car once with a yearly change in value; tick Still being paid off to add the loan with it.",
            "pros": [
              "Net worth moves by itself after the first entry.",
              "Loans show what is left to pay, how each payment splits into interest and principal, and whether the balance matches the bank's table."
            ],
            "cons": [
              "\"What moved\" shows once two periods are recorded."
            ],
            "tips": [
              "Today lists, once a month, the assets whose value is over a year old; update them there."
            ]
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
            "what": "Log money in, out or between accounts, with the source and particulars. For e-wallet and bank apps, \"Open app & log it\" holds it as pending until you confirm it went through.",
            "how": "Wealth → + , or Today → Expense.",
            "pros": [
              "The pending step keeps balances honest without bank sync."
            ],
            "cons": [],
            "tips": [
              "Paying through a bank or e-wallet app? Use \"Open app & log it\" so the entry waits until you confirm it went through."
            ]
          },
          {
            "name": "Money goals",
            "tags": [
              "plus"
            ],
            "what": "Save toward a target, for the family, yourself or a child: a From account (up to two, with what each gives a month) and a To account where it is kept, a start and a target end date, and \"set aside ₱X a month\" worked out for you. Each savings goal is also a ring on Planner; edit either side and both follow.",
            "how": "Wealth → Add Goal (or Planner → Goals → New goal → Money). Put money in moves it From → To.",
            "pros": [
              "Contributions come out of a real account, so the progress is real.",
              "One goal, seen on both Wealth and Planner."
            ],
            "cons": [
              "Kin keeps the record; the money stays in your account."
            ],
            "tips": []
          },
          {
            "name": "Lending and savings circles",
            "tags": [
              "plus"
            ],
            "what": "Who owes whom, paid back at once or in 2 to 120 instalments (weekly, twice a month or monthly), each marked overdue on its own. A savings circle with its turns and who has paid each round.",
            "how": "Wealth → Lending & savings circles (also under Add income → Lent money paid back). Kin writes a polite reminder for you to send yourself.",
            "pros": [
              "Replaces the sheet of paper for the office savings circle.",
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
            "what": "Money sent home: from whom, in which of 20 currencies, the amount that arrived, how it came, and what it went to.",
            "how": "Wealth → Cash Flow → Add income → Remittance. Log the amount that actually arrived.",
            "pros": [
              "The family abroad sees what came home and where it went."
            ],
            "cons": [],
            "tips": [
              "log the amount that actually arrived; the rate shown is a reference only."
            ]
          },
          {
            "name": "Statement import (CSV)",
            "tags": [
              "plus"
            ],
            "what": "Bring in a month of transactions from a bank or e-wallet CSV or PDF export.",
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
            "tips": [
              "if this phone can't get reminders, Today says so with a Fix button."
            ]
          },
          {
            "name": "Alarms",
            "tags": [
              "phone"
            ],
            "what": "In the Kin iPhone app, medicine doses ring like the Clock app: full screen, with sound even on silent, offline too. Any plan, check-up or bill can ring the same way.",
            "how": "Settings → Notifications → Alarms. Doses follow Health reminders; switch on each plan, check-up or bill you want to ring.",
            "pros": [
              "A dose or an appointment isn't missed because the phone was on silent."
            ],
            "cons": [
              "Needs the Kin iPhone app; in a browser the choices are kept for when it's installed."
            ],
            "tips": [
              "open Kin once a week or so: each time it opens, it sets the next two weeks of alarms."
            ]
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
              "High contrast with large text suits grandparents."
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
            "how": "Settings → Household. Set your country; add the town festival under Special days.",
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
            "what": "A link for the household helper or driver, with switches for To-Buy, Meals and Family plans. The helper makes a free account of their own and sees only what you switch on, never money, health or the vault.",
            "how": "Settings → Household → Helpers → make a link; print the QR for the kitchen.",
            "pros": [
              "The helper sees only what you switch on.",
              "Removing the link ends access at once."
            ],
            "cons": [
              "The helper needs an email to make an account; the link works once and lapses after 7 days, so make a new one if it goes unused."
            ],
            "tips": [
              "remove the helper the day they leave; their access ends at once."
            ]
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
            "what": "Free: calendar, chores, allowance, list and meals, chat and calls, journal (1 GB), tree, health profiles and the emergency card, 5 Kin AI uses a month. Plus (₱149 a month or ₱1,490 a year): Wealth, lending and savings circles, the vault, medicines and vitals, unlimited Kin AI, 50 GB.",
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
