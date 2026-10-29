import { TRIAL_DAYS } from "@/lib/access";
import { PLANS, pesos } from "@/lib/billing/plans";

/** The public pages people search for (approved 20 October): one each for
 * paluwagan, utang, the family tree, medicine reminders and the
 * monito-monita draw, under /features. Plain English a Filipino family
 * reads easily, the landing's voice ("Family Life, Decoded"), real
 * screenshots of the sample household (never a real family's), the free or
 * Plus line, and "Start with Kin". Data only: the page, the sitemap and the
 * Open Graph image all read this one list. */

export type FeatureShot = { src: string; alt: string; caption: string };

export type FeaturePage = {
  slug: string;
  /** The page's name, as in the title tag and the nav. */
  name: string;
  /** The <title>, under about 60 characters, with the word people type. */
  title: string;
  /** The meta description, under 160 characters. */
  description: string;
  eyebrow: string;
  /** The h1. */
  heading: string;
  /** The line under it. */
  lead: string;
  /** What it is, for someone who has never used an app for it. */
  intro: string[];
  /** How Kin does it, one plain line each. */
  how: { title: string; line: string }[];
  shots: FeatureShot[];
  plan: "free" | "plus";
  /** Questions people type into a search box, answered in a sentence or two. */
  questions: { q: string; a: string }[];
  /** Other pages worth a look. */
  related: string[];
};

const plus = pesos(PLANS.monthly.amountCents);
const plusYear = pesos(PLANS.annual.amountCents);

/** The free or Plus line, the same facts as the plan screen (plan-features.ts).
 * Without the price in the Kin Android app (lib/native.ts, inAndroidApp). */
export function featurePlanLine(plan: "free" | "plus", opts: { prices?: boolean } = {}): string {
  if (plan === "free") return `Part of Kin Free, for good. No card, no trial clock.`;
  return `Part of Kin Plus${opts.prices === false ? ", for" : `: ${plus} a month or ${plusYear} a year for`} the whole family. Every family starts with ${TRIAL_DAYS} days of Plus free, no card needed; do nothing and you move to Kin Free and keep everything.`;
}

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "paluwagan",
    name: "Savings circle",
    title: "Savings circle tracker: turns, contributions, who paid",
    description: "Keep your savings circle straight: everyone's contribution each round, whose turn the pot is, and a polite reminder you send yourself. Kin, the family app.",
    eyebrow: "Savings circle",
    heading: "The savings circle, without the notebook",
    lead: "Everyone puts in the same each round, and each round one of you takes the pot. Kin keeps the turns, the contributions and who hasn’t paid yet, so nobody has to ask twice.",
    intro: [
      "A savings circle is the pool we already run with officemates, friends or neighbours: say ₱2,000 each twice a month, five of you, and a ₱10,000 pot that goes to a different member each round. It works on trust, and it falls apart in a group chat when nobody is sure who has paid.",
      "Kin gives the organizer, or any member, a plain list: the group, the rounds with their dates, whose pot each round is, and a tick per person per round. It is a record only. Kin moves no money and never messages anyone; you tick what you saw, and you decide what to send.",
    ],
    how: [
      { title: "Set it up in a minute", line: "A name, the contribution per member, weekly, twice a month (the 15th and the 30th) or monthly, the start date, and the members in turn order. Rounds after the 15th fall on their own days." },
      { title: "Tick who has paid", line: "Each round shows its date, whose pot it is and a tick per member. The round you are in is outlined; the pot that is yours says so." },
      { title: "A reminder you send yourself", line: "Turn on reminders and Kin writes a polite message for whoever is behind. You tap Share or Copy and send it from your own messaging app. Kin never contacts anyone." },
      { title: "Private to the grown-ups", line: "Children in the household never see it. Mark a group Just me and only you see it." },
    ],
    shots: [
      { src: "/features/paluwagan/1.webp", alt: "A savings circle in Kin: five rounds, each with its date, whose pot it is and a tick per member", caption: "Rounds, turns and ticks, in one place." },
      { src: "/features/paluwagan/2.webp", alt: "The Lending and savings circles screen with the savings circle card: round 3 of 5, our turn, two not in yet", caption: "Round 3 of 5, our turn, two not in yet." },
      { src: "/features/paluwagan/3.webp", alt: "Prepare reminders turned on: a Remind button beside each member who has not paid this round", caption: "Remind, in your own words, from your own phone." },
    ],
    plan: "plus",
    questions: [
      { q: "Does Kin collect or hold the money?", a: "No. Kin is the notebook, not the collector. You collect as you always have; Kin keeps who paid when and whose turn it is." },
      { q: "Can the other members see it?", a: "The record is your household’s. Members who are not in your family see nothing; what you send them is the message you choose to share." },
      { q: "Can rounds fall twice a month?", a: "Yes. Pick twice a month and the rounds land on the 15th and the end of the month, including a start after the 15th." },
    ],
    related: ["utang", "monito-monita"],
  },
  {
    slug: "utang",
    name: "Lending",
    title: "Lending tracker: who owes whom, paid back bit by bit",
    description: "Money lent to a relative, or borrowed from one, and every payment back, in one list. A gentle reminder you send yourself. Kin, the family app.",
    eyebrow: "Lending",
    heading: "Lending, written down kindly",
    lead: "Money lent to a relative, or borrowed from one, and every bit paid back. Kin keeps the amounts straight so the relationship doesn’t have to carry them.",
    intro: [
      "Most families keep IOUs in their heads: a brother borrowed ₱5,000 in September, gave back ₱2,000 in October, and nobody remembers the rest the same way. Asking feels awkward, so nobody asks, and the number quietly becomes a sore point.",
      "Kin keeps a plain record: who owes us, what we owe, when it started, when it is due, and each payment as it comes in. The totals at the top do the arithmetic. When you want to follow up, Kin writes a gentle message for you to send yourself, in your own time.",
    ],
    how: [
      { title: "Lent or borrowed", line: "Record an IOU either way: the person, the amount, when, and a due date if there is one. A note keeps the reason (“for the tricycle repair”)." },
      { title: "Payments as they come", line: "Record ₱500 today, ₱1,000 next payday. The card shows what is left, and “Owed to us” and “We owe” stay current." },
      { title: "A reminder you send yourself", line: "Turn a reminder on and Kin prepares a polite message, thanks for what came back first. You Share or Copy it. Kin never contacts anyone." },
      { title: "Just me, when it should be", line: "An entry marked Just me is seen only by whoever recorded it. Children in the household never see any of this." },
    ],
    shots: [
      { src: "/features/utang/1.webp", alt: "The Lending and savings circles screen: Owed to us ₱4,500, We owe ₱6,000, and two entries with Record a payment", caption: "Owed to us, we owe, and each entry under it." },
      { src: "/features/utang/2.webp", alt: "A gentle reminder Kin wrote for a brother who owes us, with Share and Copy buttons", caption: "Kin writes it; you decide whether to send it." },
      { src: "/features/utang/3.webp", alt: "Recording a payment on an IOU: the amount, the date and Save payment", caption: "₱1,500 left, a payment at a time." },
    ],
    plan: "plus",
    questions: [
      { q: "Will Kin message the person who owes us?", a: "Never. Kin prepares the words; sending them is yours, from your own Messenger, Viber or SMS." },
      { q: "Can my spouse see it too?", a: "Yes, the grown-ups in the household share the list. Mark an entry Just me and only you see it." },
      { q: "Is it counted in our money?", a: "Lending is its own list, beside Wealth. Your accounts and budgets are not changed by it." },
    ],
    related: ["paluwagan", "medicine-reminders"],
  },
  {
    slug: "family-tree",
    name: "Family tree",
    title: "Family tree app: parents, grandparents, cousins and everyone",
    description: "Build the family tree from your phone: parents, grandparents, aunts, uncles and cousins, with stories and birthdays. A GEDCOM file in or out. Kin, the family app.",
    eyebrow: "Family tree",
    heading: "The family tree, finally in one place",
    lead: "Add yourself, then your father, your mother, and anyone else you know. The tree grows from there, and everybody in the house sees the same one.",
    intro: [
      "Every family has someone who knows how everybody is related, and the rest of us ask them at reunions. A tree that lives in one phone, with birthdays and the odd story, means the answer doesn’t leave with them.",
      "Kin draws the tree from who you add: parents, spouses, children, and the brothers, sisters, aunts, uncles and cousins that follow. Your household is marked on it; relatives who use Kin can link their side so both families see more. On All Saints' Day the tree lights a candle for those who have passed, and Today remembers their day.",
    ],
    how: [
      { title: "Start with you", line: "Add your father, your mother and a spouse; add their parents, and the grandparents appear above. A brother or a sister, and the cousins line up." },
      { title: "Names, dates and stories", line: "A birthday, a date of passing, a note. Record a story about someone and it stays with them on the tree." },
      { title: "Two families, one tree", line: "Link a relative’s household on Kin and you see each other’s side of the tree, by name, without sharing anything else." },
      { title: "Bring a tree in, or take yours out", line: "A GEDCOM (.ged) file, the one MyHeritage, FamilySearch and Ancestry all read. You see who is in it before anything is added." },
    ],
    shots: [
      { src: "/features/family-tree/1.webp", alt: "A family tree in Kin: Grandpa Ben and Grandma Nena above, Quinn and a brother below, a niece under him", caption: "Drawn from who you add, your household marked." },
      { src: "/features/family-tree/2.webp", alt: "Manage people under the tree: Quinn’s card with Add brother, sister, spouse and child", caption: "Add a brother, a sister, a spouse, a child." },
      { src: "/features/family-tree/3.webp", alt: "The tree file screen: export the household’s tree, or import a .ged file", caption: "A GEDCOM in or out, when you need it." },
    ],
    plan: "free",
    questions: [
      { q: "Is the family tree free?", a: "Yes. The tree, the stories and the relatives’ feed are in Kin Free. Bringing a whole tree file in, or taking yours out, is part of Kin Plus." },
      { q: "Who can see our tree?", a: "Your household. A linked relative’s household sees your side by name and birth year only, and you theirs." },
      { q: "Can I add someone who has passed away?", a: "Yes. Add a date of passing and Kin remembers them on All Saints' Day, on their 40th day, the first year and every anniversary." },
    ],
    related: ["monito-monita", "medicine-reminders"],
  },
  {
    slug: "medicine-reminders",
    name: "Medicine reminders",
    title: "Medicine reminder app for the family: doses, refills, missed",
    description: "Grandma’s maintenance meds, the kids’ antibiotics: dose times per person, a push at the time, a tick when taken, a nudge when missed, a refill in time.",
    eyebrow: "Medicine reminders",
    heading: "Medicines on time, for everyone at home",
    lead: "Each person’s medicines with their dose times. A reminder at the time, a tick when taken, and a word to someone if a dose is missed.",
    intro: [
      "Maintenance meds for Grandma, a week of antibiotics for the little one, vitamins for everyone: the hard part isn’t knowing, it’s remembering at 7:30 on a Tuesday, and knowing whether the other grown-up already gave it.",
      "In Kin each person has their own list. Add a medicine with its dose and times and the day shows what is due, late or done. The phone buzzes at the time, you tick it, and the whole household sees the same tick. Running low, Kin tells you before the last tablet.",
    ],
    how: [
      { title: "Per person, with times", line: "Losartan at 07:00, Metformin at 07:30 and 19:30, the syrup at 20:00 until Sunday. Each dose has its own line for the day." },
      { title: "A reminder at the time", line: "A push to the phones that should know, at the dose’s time in your own time zone. Tick it taken on any phone." },
      { title: "Missed? Tell someone", line: "Choose who hears when a dose is not ticked within the hour, so a child abroad can watch over Grandma’s meds." },
      { title: "Refills and the rest of Health", line: "Track how many are left and Kin puts the refill on the shopping list in time. Prescriptions, the illness log and vitals live beside it." },
    ],
    shots: [
      { src: "/features/medicine-reminders/1.webp", alt: "Quinn’s medicines: today’s doses at 07:00, 07:30 and 19:30 with a tick each, and the medicines taking now", caption: "Today’s doses, a tick each." },
      { src: "/features/medicine-reminders/2.webp", alt: "A child’s medicine: Cetirizine syrup 5 ml at 20:00 until a date, with Track how many are left", caption: "A week of syrup, with an end date." },
      { src: "/features/medicine-reminders/3.webp", alt: "A new health entry: illness episode, check-up, lab result, blood pressure, weight, medication, vaccination", caption: "Medicines beside the rest of Health." },
    ],
    plan: "plus",
    questions: [
      { q: "Does it work for my parents who are not good with phones?", a: "A grown-up in the household can keep Grandma’s list and tick her doses; Simple Kin makes the buttons and text bigger on her own phone." },
      { q: "Will it remind at the right time abroad?", a: "Yes. Reminders follow the household’s time zone, and each phone gets its own push." },
      { q: "What is in Kin Free?", a: "Each person’s health profile and the emergency card (allergies, blood type, doctor, HMO) are free. Medicines with reminders are part of Kin Plus." },
    ],
    related: ["family-tree", "utang"],
  },
  {
    slug: "monito-monita",
    name: "Gift exchange",
    title: "Gift exchange draw online: secret picks and wish lists",
    description: "Draw names for the Christmas exchange without the papers: Kin picks, everyone sees only who they got and their wish list, and linked households can join in.",
    eyebrow: "Gift exchange",
    heading: "The gift exchange, drawn fairly, no peeking",
    lead: "Kin draws the names. Everyone sees only who they picked, and the wish list of the one they picked. Ask the cousins’ household in, too.",
    intro: [
      "Folded papers in a bowl work until someone draws themselves, someone is absent, or the organizer knows everybody’s pick and can’t resist. And the wish lists end up in three group chats.",
      "In Kin a grown-up starts the draw: a name, a price cap, the exchange day, and whether anyone may pick someone from their own household. Each household puts in its own people, including the kids. Then one tap draws, in the database, so nobody sees more than their own pick, not even the organizer.",
    ],
    how: [
      { title: "Start a draw", line: "A name, a price cap, the exchange day (24 December to begin with), and the two rules: not your own household, and reveal on the day." },
      { title: "Everyone in", line: "Your household puts in its people; a linked relative’s household puts in theirs. A teen can put themselves in." },
      { title: "One tap, one loop", line: "Kin draws one loop through everyone, so nobody gets themselves and no pick gives another away. Households are kept apart when you ask." },
      { title: "Your pick, your wish list", line: "Tap Show my pick to see who you got and what they wish for. Write your own list; only the one who drew you reads it." },
    ],
    shots: [
      { src: "/features/monito-monita/1.webp", alt: "The gift exchange screen: a draw for 24 December and the form to start one with a name, a price cap and the exchange day", caption: "Start a draw: a name, a cap, the day." },
      { src: "/features/monito-monita/2.webp", alt: "A draw’s page: the rules, a wish list box, who is in, and the Draw names button", caption: "Who’s in, the wish lists, then Draw names." },
      { src: "/features/monito-monita/3.webp", alt: "Who is in the draw by household, the two rules as checkboxes, and Put at least 3 people in to draw", caption: "The rules, and at least three to draw." },
    ],
    plan: "free",
    questions: [
      { q: "Can relatives who don’t use Kin join?", a: "The host can make a guest link for the party event: a relative types their name in a browser and puts themselves in the draw, no app needed." },
      { q: "What if someone is absent on draw day?", a: "There is no draw day. Everyone puts themselves in when they can, and the organizer draws once the list is complete." },
      { q: "Can we draw again?", a: "Yes, any time before the exchange day. Picks are replaced, and nobody sees the old ones." },
    ],
    related: ["family-tree", "paluwagan"],
  },
];

export const FEATURE_SLUGS = FEATURE_PAGES.map((p) => p.slug);

export function featurePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((p) => p.slug === slug);
}
