import { test, expect } from "@playwright/test";
import { matchRule, resumeRule, resolveRange, resolveMember, pastRange, rulesOnlyLine, isAsk, isPending, RULES_NOTE, type RuleContext, type RuleMatch, type Ask } from "@/lib/assistant/rules";

/** Ask Kin's rule layer (lib/assistant/rules.ts, Jonathan, 28 October):
 * every question shape it answers without the model, the tool and input
 * each resolves to, the relative dates, the names, the phrasing of the
 * answers, and the questions that must stay the model's. No network, no
 * database: the matcher is pure and the tool results here are fixtures
 * shaped as tools.ts returns them.
 *
 * Every rule added to rules.ts gets a line in TABLE below. */

/** Wednesday 28 October 2026, in a household of five. */
const ctx: RuleContext = {
  today: "2026-10-28",
  members: ["Ana Santos", "Ben Santos", "Lia Santos", "Lolo Pepe Santos", "Yaya Marites"],
  currency: "PHP",
  canAskHealth: true,
  timeZone: "Asia/Manila",
  me: "Ana Santos",
};

/** The match for a question, or a failure naming it. */
function m(ask: string, c: RuleContext = ctx): RuleMatch {
  const r = matchRule(ask, c);
  if (!r) throw new Error(`"${ask}" matched nothing`);
  if (isAsk(r)) throw new Error(`"${ask}" asked back: ${r.ask}`);
  return r;
}

/** What a question's rule says from a tool result, which must be a line. */
function said(ask: string, result: unknown, c: RuleContext = ctx): string {
  const out = m(ask, c).say(result);
  if (typeof out !== "string") throw new Error(`"${ask}" asked back: ${out.ask}`);
  return out;
}

/** A say() result that must be a line, not a question. */
function line(out: string | Ask): string {
  if (typeof out !== "string") throw new Error(`asked back: ${out.ask}`);
  return out;
}

/** The question a rule asks back, or a failure. */
function asked(ask: string, c: RuleContext = ctx): Ask {
  const r = matchRule(ask, c);
  if (!r || !isAsk(r)) throw new Error(`"${ask}" did not ask back`);
  return r;
}

/* ------------------------------------------------------- the question table */

type Row = { ask: string; tool: string; input?: Record<string, unknown>; rule?: string; lang?: "en" | "tl" };

const TABLE: Row[] = [
  // bills
  { ask: "When is the electric bill due?", tool: "get_money", rule: "bills.due_when", lang: "en" },
  { ask: "kailan due ang Meralco?", tool: "get_money", rule: "bills.due_when", lang: "tl" },
  { ask: "Kailan ang bayad ng kuryente", tool: "get_money", rule: "bills.due_when", lang: "tl" },
  { ask: "What's due this week?", tool: "get_schedule", input: { from: "2026-10-28", to: "2026-11-01" }, rule: "bills.range" },
  { ask: "Anong bills ang due this month?", tool: "get_schedule", input: { from: "2026-10-28", to: "2026-10-31" }, rule: "bills.range", lang: "tl" },
  { ask: "Any bills due?", tool: "get_money", rule: "bills.unpaid" },
  { ask: "may due ba tayo bukas?", tool: "get_schedule", input: { from: "2026-10-29", to: "2026-10-29" }, rule: "bills.range", lang: "tl" },
  { ask: "Any overdue bills?", tool: "get_money", rule: "bills.overdue" },
  { ask: "How much do we owe?", tool: "get_money", rule: "bills.owed" },
  { ask: "Magkano utang natin?", tool: "get_money", rule: "bills.owed", lang: "tl" },
  { ask: "how much is due next week", tool: "get_schedule", input: { from: "2026-11-02", to: "2026-11-08" }, rule: "bills.range" },
  { ask: "How much is the Meralco bill?", tool: "get_money", rule: "bills.due_when" },
  { ask: "what is the water bill", tool: "get_money", rule: "bills.due_when" },
  { ask: "what bills are unpaid", tool: "get_money", rule: "bills.unpaid" },
  { ask: "magkano ang kuryente?", tool: "get_money", rule: "bills.due_when", lang: "tl" },
  // spending and budget
  { ask: "How much did we spend on groceries this month?", tool: "get_money", rule: "spending.category" },
  { ask: "magkano nagastos natin sa groceries this month?", tool: "get_money", rule: "spending.category", lang: "tl" },
  { ask: "Magkano na gastos natin ngayong buwan?", tool: "get_money", rule: "spending.total", lang: "tl" },
  { ask: "How much have we spent this month?", tool: "get_money", rule: "spending.total" },
  { ask: "What did Ana spend this month?", tool: "get_money", rule: "spending.member" },
  { ask: "magkano nagastos ni ben?", tool: "get_money", rule: "spending.member", lang: "tl" },
  { ask: "What's left in the budget?", tool: "get_money", rule: "budget.left" },
  { ask: "How much is left this month?", tool: "get_money", rule: "budget.left" },
  { ask: "Magkano natitira sa groceries budget?", tool: "get_money", rule: "budget.left_category", lang: "tl" },
  // balances
  { ask: "How much is in GCash?", tool: "get_money", rule: "balances.account" },
  { ask: "magkano laman ng BPI?", tool: "get_money", rule: "balances.account", lang: "tl" },
  { ask: "Maya balance", tool: "get_money", rule: "balances.account" },
  { ask: "how much is in our savings", tool: "get_money", rule: "balances.account" },
  { ask: "how much is in the bank", tool: "get_money", rule: "balances.total" },
  { ask: "How much cash do we have?", tool: "get_money", rule: "balances.total" },
  { ask: "magkano pera natin lahat?", tool: "get_money", rule: "balances.total", lang: "tl" },
  { ask: "What's our net worth?", tool: "get_money", rule: "balances.net_worth" },
  // schedule
  { ask: "What's on today?", tool: "get_schedule", input: { from: "2026-10-28", to: "2026-10-28" }, rule: "schedule.range" },
  { ask: "What's on tomorrow?", tool: "get_schedule", input: { from: "2026-10-29", to: "2026-10-29" }, rule: "schedule.range" },
  { ask: "anong meron bukas?", tool: "get_schedule", input: { from: "2026-10-29", to: "2026-10-29" }, rule: "schedule.range", lang: "tl" },
  { ask: "What's on this week?", tool: "get_schedule", input: { from: "2026-10-28", to: "2026-11-01" }, rule: "schedule.range" },
  { ask: "May lakad ba tayo sa Sabado?", tool: "get_schedule", input: { from: "2026-10-31", to: "2026-10-31" }, rule: "schedule.range", lang: "tl" },
  { ask: "what's the schedule next Friday", tool: "get_schedule", input: { from: "2026-11-06", to: "2026-11-06" }, rule: "schedule.range" },
  { ask: "What's happening on the 15th?", tool: "get_schedule", input: { from: "2026-11-15", to: "2026-11-15" }, rule: "schedule.range" },
  { ask: "What's on this weekend?", tool: "get_schedule", input: { from: "2026-10-31", to: "2026-11-01" }, rule: "schedule.range" },
  { ask: "What's happening in December?", tool: "get_schedule", input: { from: "2026-12-01", to: "2026-12-31" }, rule: "schedule.range" },
  { ask: "anong meron sa Nobyembre", tool: "get_schedule", input: { from: "2026-11-01", to: "2026-11-30" }, rule: "schedule.range", lang: "tl" },
  { ask: "Anong schedule ni Lia ngayon?", tool: "get_schedule", input: { from: "2026-10-28", to: "2026-10-28" }, rule: "schedule.range", lang: "tl" },
  { ask: "When is the dentist?", tool: "search", input: { query: "dentist" }, rule: "schedule.when_is" },
  { ask: "kailan ang beach trip?", tool: "search", input: { query: "beach trip" }, rule: "schedule.when_is", lang: "tl" },
  { ask: "What time is Lia's dentist?", tool: "search", input: { query: "dentist" }, rule: "schedule.when_is" },
  { ask: "What time is the grocery run tomorrow?", tool: "search", input: { query: "grocery run" }, rule: "schedule.when_is" },
  { ask: "Who has a checkup?", tool: "get_family", rule: "family.checkups" },
  { ask: "When is Lia's checkup?", tool: "get_family", rule: "family.checkups" },
  { ask: "sino may check-up?", tool: "get_family", rule: "family.checkups", lang: "tl" },
  // shopping and meals
  { ask: "What's on the list?", tool: "get_household", rule: "household.list" },
  { ask: "anong nasa listahan?", tool: "get_household", rule: "household.list", lang: "tl" },
  { ask: "What do we need to buy?", tool: "get_household", rule: "household.list" },
  { ask: "What's for dinner?", tool: "get_schedule", input: { from: "2026-10-28", to: "2026-10-28" }, rule: "household.meals" },
  { ask: "anong ulam bukas?", tool: "get_schedule", input: { from: "2026-10-29", to: "2026-10-29" }, rule: "household.meals", lang: "tl" },
  { ask: "what are the meals this week", tool: "get_schedule", input: { from: "2026-10-28", to: "2026-11-01" }, rule: "household.meals" },
  // family
  { ask: "Who is in the family?", tool: "get_family", rule: "family.members" },
  { ask: "sino sino ang nasa pamilya?", tool: "get_family", rule: "family.members", lang: "tl" },
  { ask: "When is Lia's birthday?", tool: "get_family", rule: "family.birthday" },
  { ask: "kailan birthday ni lolo?", tool: "get_family", rule: "family.birthday", lang: "tl" },
  { ask: "How old is Lia?", tool: "get_family", rule: "family.age" },
  // health, grown-ups only
  { ask: "What is Lia's allergy?", tool: "get_health", input: { member_name: "Lia" }, rule: "health.allergies" },
  { ask: "Ano ang allergy ni Lia?", tool: "get_health", input: { member_name: "Lia" }, rule: "health.allergies", lang: "tl" },
  { ask: "What's Dad's blood type? I mean Ben's", tool: "get_health", input: { member_name: "Ben" }, rule: "health.blood_type" },
  { ask: "Anong gamot ni Lolo ngayon?", tool: "get_health", input: { member_name: "Lolo" }, rule: "health.medicines_now", lang: "tl" },
  { ask: "What medicines does Ana take?", tool: "get_health", input: { member_name: "Ana" }, rule: "health.medicines_now" },
  { ask: "Who is Lia's doctor?", tool: "get_health", input: { member_name: "Lia" }, rule: "health.usual_doctor" },
  // plain adds, every detail present
  { ask: "Add milk to the list", tool: "add_buy_items", input: { items: [{ name: "milk" }] }, rule: "add.list" },
  { ask: "Pa-add ng gatas", tool: "add_buy_items", input: { items: [{ name: "gatas" }] }, rule: "add.list", lang: "tl" },
  { ask: "Add milk and eggs to the list", tool: "add_buy_items", input: { items: [{ name: "milk" }, { name: "eggs" }] }, rule: "add.list" },
  { ask: "add 3 eggs to the list", tool: "add_buy_items", input: { items: [{ name: "eggs", quantity: 3 }] }, rule: "add.list" },
  { ask: "Add 1 L milk and 2 packs of noodles to the list", tool: "add_buy_items", input: { items: [{ name: "milk", quantity: 1, unit: "L" }, { name: "noodles", quantity: 2, unit: "pack" }] }, rule: "add.list" },
  { ask: "add 2 kilos of chicken and 1 dozen eggs to the shopping list", tool: "add_buy_items", input: { items: [{ name: "chicken", quantity: 2, unit: "kg" }, { name: "eggs", quantity: 1, unit: "dozen" }] }, rule: "add.list" },
  { ask: "pakibili ng toyo at suka", tool: "add_buy_items", input: { items: [{ name: "toyo" }, { name: "suka" }] }, rule: "add.list", lang: "tl" },
  { ask: "Add Meralco bill 3200 due Nov 15", tool: "add_bill", input: { name: "Meralco", amount: 3200, due_date: "2026-11-15", category: "Utilities" }, rule: "add.bill" },
  { ask: "add water bill ₱850 due the 5th", tool: "add_bill", input: { name: "Water", amount: 850, due_date: "2026-11-05", category: "Utilities" }, rule: "add.bill" },
  { ask: "pa-add ng bill: Globe 1,299 due sa 20", tool: "add_bill", input: { name: "Globe", amount: 1299, due_date: "2026-11-20", category: "Utilities" }, rule: "add.bill", lang: "tl" },
  { ask: "add tuition 15,000 due next Friday", tool: "add_bill", input: { name: "Tuition", amount: 15000, due_date: "2026-11-06", category: "Education" }, rule: "add.bill" },
  { ask: "Add Netflix 549 due every 10th", tool: "add_bill", input: { name: "Netflix", amount: 549, due_date: "2026-11-10", category: "Subscriptions", recurrence: "monthly" }, rule: "add.bill" },
  // the wider lookups (third PR): goals, debts and lending, subscriptions, documents, chores, piggy bank, guests, past months, the journal, where-is, do-we-have
  { ask: "How far is the Baguio fund?", tool: "get_money", rule: "goals.one" },
  { ask: "kumusta ang ipon natin para sa Baguio", tool: "get_money", rule: "goals.one", lang: "tl" },
  { ask: "what are our savings goals", tool: "get_money", rule: "goals.list" },
  { ask: "How much do we owe on the car loan?", tool: "get_debts", rule: "debts.loans" },
  { ask: "who owes us", tool: "get_debts", rule: "debts.owed_to_us" },
  { ask: "sino may utang sa atin", tool: "get_debts", rule: "debts.owed_to_us", lang: "tl" },
  { ask: "how much does Tita Baby owe us", tool: "get_debts", rule: "debts.owed_to_us" },
  { ask: "do I owe anyone", tool: "get_debts", rule: "debts.we_owe" },
  { ask: "what subscriptions do we pay", tool: "get_subscriptions", rule: "subscriptions.list" },
  { ask: "magkano ang subscriptions natin", tool: "get_subscriptions", rule: "subscriptions.list", lang: "tl" },
  { ask: "when is Netflix next charged", tool: "get_subscriptions", rule: "subscriptions.one" },
  { ask: "when does Lia's passport expire", tool: "get_documents", input: { query: "passport" }, rule: "documents.one" },
  { ask: "what documents expire soon", tool: "get_documents", input: {}, rule: "documents.expiring" },
  { ask: "anong mag-expire na documents", tool: "get_documents", input: {}, rule: "documents.expiring", lang: "tl" },
  { ask: "is the car registration still valid", tool: "get_documents", input: { query: "car registration" }, rule: "documents.one" },
  { ask: "what are Lia's chores today", tool: "get_tasks", input: { from: "2026-10-28", to: "2026-10-28", member_name: "Lia" }, rule: "tasks.list" },
  { ask: "anong gawain ni Lia ngayon", tool: "get_tasks", input: { from: "2026-10-28", to: "2026-10-28", member_name: "Lia" }, rule: "tasks.list", lang: "tl" },
  { ask: "who hasn't done their chores", tool: "get_tasks", input: { from: "2026-10-28", to: "2026-10-28" }, rule: "tasks.not_done" },
  { ask: "sino hindi pa tapos sa chores", tool: "get_tasks", input: { from: "2026-10-28", to: "2026-10-28" }, rule: "tasks.not_done", lang: "tl" },
  { ask: "did Ben do his chores", tool: "get_tasks", input: { from: "2026-10-28", to: "2026-10-28", member_name: "Ben" }, rule: "tasks.did" },
  { ask: "whose turn is it to wash the dishes", tool: "get_tasks", input: { from: "2026-10-28", to: "2026-10-28" }, rule: "tasks.turn" },
  { ask: "what chores are there tomorrow", tool: "get_tasks", input: { from: "2026-10-29", to: "2026-10-29" }, rule: "tasks.list" },
  { ask: "how much is in Lia's piggy bank", tool: "get_allowance", input: { member_name: "Lia" }, rule: "allowance.jars" },
  { ask: "magkano ang alkansya ni Lia", tool: "get_allowance", input: { member_name: "Lia" }, rule: "allowance.jars", lang: "tl" },
  { ask: "how many points does Ben have", tool: "get_allowance", input: { member_name: "Ben" }, rule: "allowance.points" },
  { ask: "who's coming to Lia's party", tool: "get_event_guests", input: { query: "lia" }, rule: "events.guests" },
  { ask: "sino pupunta sa party ni Lia", tool: "get_event_guests", input: { query: "lia" }, rule: "events.guests", lang: "tl" },
  { ask: "how many are coming Saturday", tool: "get_event_guests", input: { date: "2026-10-31" }, rule: "events.guests" },
  { ask: "who's coming on Nov 20", tool: "get_event_guests", input: { date: "2026-11-20" }, rule: "events.guests" },
  { ask: "How much did we spend last month?", tool: "get_spending", input: { from: "2026-09-01", to: "2026-09-30" }, rule: "spending.past_total" },
  { ask: "magkano nagastos natin noong nakaraang buwan", tool: "get_spending", input: { from: "2026-09-01", to: "2026-09-30" }, rule: "spending.past_total", lang: "tl" },
  { ask: "how much did we spend on groceries in September", tool: "get_spending", input: { from: "2026-09-01", to: "2026-09-30" }, rule: "spending.past_category" },
  { ask: "how much did we spend in the last 3 months", tool: "get_spending", input: { from: "2026-07-01", to: "2026-09-30" }, rule: "spending.past_total" },
  { ask: "what did Ana spend last month", tool: "get_spending", input: { from: "2026-09-01", to: "2026-09-30" }, rule: "spending.past_member" },
  { ask: "how much did we earn last month", tool: "get_spending", input: { from: "2026-09-01", to: "2026-09-30" }, rule: "spending.past_income" },
  { ask: "how much did we spend this year", tool: "get_spending", input: { from: "2026-01-01", to: "2026-10-28" }, rule: "spending.past_total" },
  { ask: "what happened on this day", tool: "get_journal", input: { on_day: "10-28" }, rule: "journal.on_this_day" },
  { ask: "anong nangyari ngayong araw noon", tool: "get_journal", input: { on_day: "10-28" }, rule: "journal.on_this_day", lang: "tl" },
  { ask: "what did we write in the journal last week", tool: "get_journal", input: { from: "2026-10-19", to: "2026-10-25" }, rule: "journal.range" },
  { ask: "latest journal entry", tool: "get_journal", input: {}, rule: "journal.latest" },
  { ask: "journal entries about Baguio", tool: "get_journal", input: { query: "baguio" }, rule: "journal.about" },
  { ask: "where is the birth certificate", tool: "search", input: { query: "birth certificate" }, rule: "search.where_is" },
  { ask: "nasaan ang passport ni Lia", tool: "search", input: { query: "passport" }, rule: "search.where_is", lang: "tl" },
  { ask: "where did we save the car OR/CR", tool: "search", input: { query: "car or/cr" }, rule: "search.where_is" },
  { ask: "do we have rice", tool: "get_household", rule: "household.have" },
  { ask: "may bigas pa ba tayo", tool: "get_household", rule: "household.have", lang: "tl" },
  { ask: "are we out of milk", tool: "get_household", rule: "household.have" },
  { ask: "meron pa ba tayong toyo", tool: "get_household", rule: "household.have", lang: "tl" },
  { ask: "do we have plans tomorrow", tool: "get_schedule", input: { from: "2026-10-29", to: "2026-10-29" }, rule: "schedule.range" },
  // plain adds through the one-line parser: an activity with a day and a time, an event, a meal
  { ask: "Add dentist on Friday at 3pm", tool: "add_activity", input: { title: "Dentist", date: "2026-10-30", start_time: "15:00", whole_family: false, member_names: ["Ana"] }, rule: "add.activity" },
  { ask: "add Lia dentist tomorrow 9am", tool: "add_activity", input: { title: "Dentist", date: "2026-10-29", start_time: "09:00", whole_family: false, member_names: ["Lia"] }, rule: "add.activity" },
  { ask: "schedule family dinner at Lola's Saturday 6pm for everyone", tool: "add_activity", input: { title: "Family dinner at Lola's", date: "2026-10-31", start_time: "18:00", whole_family: true }, rule: "add.activity" },
  { ask: "pa-schedule ng dentist ni Lia bukas alas-3 ng hapon", tool: "add_activity", input: { title: "Dentist", date: "2026-10-29", start_time: "15:00", whole_family: false, member_names: ["Lia"] }, rule: "add.activity", lang: "tl" },
  { ask: "add Lola Nena's birthday Dec 3", tool: "add_event", input: { title: "Lola Nena's birthday", date: "2026-12-03", kind: "birthday" }, rule: "add.event" },
  { ask: "add birthday party for Lia Nov 20", tool: "add_event", input: { title: "Birthday party for Lia", date: "2026-11-20", kind: "birthday" }, rule: "add.event" },
  { ask: "Add swimming for Lia and Ben Saturday 8am", tool: "add_activity", input: { title: "Swimming", date: "2026-10-31", start_time: "08:00", whole_family: false, member_names: ["Ben", "Lia"] }, rule: "add.activity" },
  { ask: "add to the list: milk, eggs, bread", tool: "add_buy_items", input: { items: [{ name: "milk" }, { name: "eggs" }, { name: "bread" }] }, rule: "add.list" },
  { ask: "add dinner adobo tomorrow", tool: "add_meal_plan", input: { date: "2026-10-29", dish: "Adobo" }, rule: "add.meal" },
  { ask: "pa-add ng ulam na sinigang bukas", tool: "add_meal_plan", input: { date: "2026-10-29", dish: "Sinigang" }, rule: "add.meal", lang: "tl" },
  { ask: "add goal Baguio trip 20000 by December", tool: "add_goal", input: { title: "Baguio trip", target_amount: 20000, target_date: "2026-12-31" }, rule: "add.goal" },
  { ask: "set a savings goal: emergency fund 100,000", tool: "add_goal", input: { title: "Emergency fund", target_amount: 100000 }, rule: "add.goal" },
  { ask: "journal: Lia lost her first tooth today", tool: "add_journal_entry", input: { title: "Lia lost her first tooth today", date: "2026-10-28" }, rule: "add.journal" },
  { ask: "add trip Baguio Dec 20 to Dec 23", tool: "add_trip", input: { title: "Baguio", start_date: "2026-12-20", end_date: "2026-12-23" }, rule: "add.trip" },
  { ask: "plan a trip to Boracay next Friday", tool: "add_trip", input: { title: "Boracay", start_date: "2026-11-06" }, rule: "add.trip" },
];

for (const row of TABLE) {
  test(`"${row.ask}" → ${row.tool}${row.input ? " " + JSON.stringify(row.input) : ""}`, () => {
    const r = m(row.ask);
    expect(r.tool).toBe(row.tool);
    if (row.input) expect(r.input).toEqual(row.input);
    if (row.rule) expect(r.rule).toBe(row.rule);
    if (row.lang) expect(r.lang).toBe(row.lang);
  });
}

/* ------------------------------------------------- what stays the model's */

const FOR_THE_MODEL = [
  "Help me plan the week",
  "Should we buy a car this year?",
  "Add milk to the list and then tell me what's for dinner",
  "Why is our electric bill so high?",
  "Record 500 from GCash for lunch",
  "Delete the water bill",
  "What's the weather tomorrow?",
  "hi",
  "Can we afford a trip to Baguio in December?",
  "Summarise this month's money",
  "When is Lola Nena's birthday?",
  "What is Lia's allergy, and add cetirizine to the list",
  // One person's spending in one category: get_money splits by one or the other.
  "how much did Ana spend on groceries",
  // An add with no list named, in English, could be anything.
  "add bananas",
  // A price, not a balance.
  "How much is 3 kilos of rice?",
  "Did we pay Meralco?",
  "Thanks!",
  // An add with the day or the time missing, or something that repeats (a routine).
  "add dentist",
  "add dentist tomorrow",
  "add Ben's soccer practice every Tuesday 4pm",
  "plan a trip to Boracay",
  "schedule a call with the dentist",
  "add a chore: dishes for Lia daily",
  "add 500 to GCash",
  // Where a person is: Where everyone is, and the model's.
  "where is Lia",
  "do we have money",
];

for (const ask of FOR_THE_MODEL) {
  test(`"${ask}" is left to the model`, () => {
    expect(matchRule(ask, ctx)).toBeNull();
  });
}

/* ------------------------------------------------- questions asked back */

test("a bill with a detail missing is asked for, not guessed and not handed on", () => {
  const both = asked("add bill meralco");
  expect(both.ask).toBe("How much is the Meralco bill, and when is it due?");
  expect(both.pending).toMatchObject({ rule: "add.bill", slots: { name: "meralco", category: "Utilities" }, lang: "en", asked: 1 });
  expect(asked("add Meralco bill due Nov 15").ask).toBe("How much is the Meralco bill?");
  expect(asked("add water bill 900").ask).toBe("When is Water due?");
  expect(asked("add Netflix subscription 549").ask).toBe("When is Netflix due?");
  expect(asked("pa-add ng bill na Globe").ask).toBe("Magkano ang Globe, at kailan ang due?");
  expect(isPending(both.pending)).toBe(true);
  expect(isPending({ rule: "x" })).toBe(false);
});

test("the answer finishes the add; a half answer is asked for once more; a third miss gives up", () => {
  const first = asked("add bill meralco");
  const done = resumeRule(first.pending, "3200 due Nov 15", ctx);
  expect(done && !isAsk(done) ? done.input : null).toEqual({ name: "Meralco", amount: 3200, due_date: "2026-11-15", category: "Utilities" });
  // Only the amount: the day is asked for next, the amount kept.
  const half = resumeRule(first.pending, "₱3,200", ctx);
  expect(half && isAsk(half) ? half.ask : null).toBe("When is Meralco due?");
  expect(half && isAsk(half) ? half.pending.slots : null).toMatchObject({ name: "meralco", amount: 3200 });
  const finished = resumeRule((half as Ask).pending, "the 15th", ctx);
  expect(finished && !isAsk(finished) ? finished.input : null).toEqual({ name: "Meralco", amount: 3200, due_date: "2026-11-15", category: "Utilities" });
  // Twice asked and still nothing: the message is read afresh.
  const second = resumeRule(first.pending, "hmm", ctx);
  expect(second && isAsk(second) ? second.pending.asked : null).toBe(2);
  expect(resumeRule((second as Ask).pending, "hmm", ctx)).toBeNull();
  // Never mind drops it.
  const dropped = resumeRule(first.pending, "never mind", ctx);
  expect(dropped && isAsk(dropped) ? dropped.ask : null).toBe("Okay, not added.");
  // "every month" on the answer makes it monthly.
  const monthly = resumeRule(first.pending, "1500 every 20th", ctx);
  expect(monthly && !isAsk(monthly) ? monthly.input : null).toMatchObject({ amount: 1500, due_date: "2026-11-20", recurrence: "monthly" });
});

test("two bills answering to one word: which one is asked, and the chip's answer picks it", () => {
  const two = { ...moneyResult, unpaid_bills: [...unpaid, { name: "Globe Postpaid", amount: 999, due_date: "2026-11-03", status: "unpaid" }] };
  const out = m("when is globe due").say(two);
  expect(isAsk(out) ? out.ask : out).toBe("Which one: Globe Fiber or Globe Postpaid?");
  expect(isAsk(out) ? out.choices : null).toEqual(["Globe Fiber", "Globe Postpaid"]);
  const picked = resumeRule((out as Ask).pending, "Globe Postpaid", ctx);
  expect(picked && !isAsk(picked) ? line(picked.say(two)) : null).toBe("Globe Postpaid (₱999) is due Tue 3 Nov (in 6 days).");
  // One bill by that word: no question.
  expect(said("when is globe due", moneyResult)).toContain("Globe Fiber (₱1,299)");
});

test("plain adds confirm in a few words", () => {
  expect(said("Add dentist on Friday at 3pm", { added: "activity" })).toBe("Added Dentist, Fri 30 Oct 15:00 (Ana).");
  expect(said("add dinner adobo tomorrow", { added: "meal plan" })).toBe("Planned Adobo for Thu 29 Oct.");
  expect(said("add Lola Nena's birthday Dec 3", { added: "event" })).toBe("Added Lola Nena's birthday on Thu 3 Dec.");
  expect(said("add goal Baguio trip 20000 by December", { added: "goal" })).toBe("Goal set: Baguio trip, ₱20,000 by Thu 31 Dec.");
  expect(said("journal: Lia lost her first tooth today", { added: "journal entry" })).toBe("Written in the journal for Wed 28 Oct.");
  expect(said("add trip Baguio Dec 20 to Dec 23", { added: "trip" })).toBe("Trip planned: Baguio, Sun 20 Dec to Wed 23 Dec.");
  // Without the asker's name, an activity with nobody named is the whole family's.
  expect(m("Add dentist on Friday at 3pm", { ...ctx, me: undefined }).input).toMatchObject({ whole_family: true });
});

test("a health question from someone who may not ask is never a rule's", () => {
  expect(matchRule("What is Lia's allergy?", { ...ctx, canAskHealth: false })).toBeNull();
  expect(matchRule("Anong gamot ni Lolo?", { ...ctx, canAskHealth: false })).toBeNull();
  // The same question from a grown-up still is.
  expect(m("What is Lia's allergy?").tool).toBe("get_health");
});

test("a name nobody in the household has leaves the question to the model", () => {
  expect(matchRule("What is Carlo's blood type?", ctx)).toBeNull();
  expect(matchRule("When is Carlo's birthday?", ctx)).toBeNull();
});

/* ---------------------------------------------------------------- dates */

test("relative dates resolve from today, Wednesday 28 October", () => {
  const day = (text: string) => resolveRange(text, ctx.today);
  expect(day("bukas")).toMatchObject({ from: "2026-10-29", to: "2026-10-29", single: true });
  expect(day("tomorrow")).toMatchObject({ from: "2026-10-29" });
  expect(day("day after tomorrow")).toMatchObject({ from: "2026-10-30" });
  expect(day("today")).toMatchObject({ from: "2026-10-28", to: "2026-10-28" });
  expect(day("this week")).toMatchObject({ from: "2026-10-28", to: "2026-11-01" });
  expect(day("next week")).toMatchObject({ from: "2026-11-02", to: "2026-11-08" });
  expect(day("this weekend")).toMatchObject({ from: "2026-10-31", to: "2026-11-01" });
  expect(day("this month")).toMatchObject({ from: "2026-10-28", to: "2026-10-31" });
  expect(day("next month")).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
  // A weekday is the coming one, today included; "next" is next week's.
  expect(day("on Friday")).toMatchObject({ from: "2026-10-30" });
  expect(day("sa Biyernes")).toMatchObject({ from: "2026-10-30" });
  expect(day("this Wednesday")).toMatchObject({ from: "2026-10-28" });
  expect(day("Monday")).toMatchObject({ from: "2026-11-02" });
  expect(day("next Friday")).toMatchObject({ from: "2026-11-06" });
  expect(day("next Monday")).toMatchObject({ from: "2026-11-02" });
  // A day of the month is the next such day.
  expect(day("the 15th")).toMatchObject({ from: "2026-11-15" });
  expect(day("the 30th")).toMatchObject({ from: "2026-10-30" });
  expect(day("sa 5")).toMatchObject({ from: "2026-11-05" });
  // A month and day, either order, English or Filipino; past ones roll to next year.
  expect(day("Nov 15")).toMatchObject({ from: "2026-11-15" });
  expect(day("15 November")).toMatchObject({ from: "2026-11-15" });
  expect(day("15 ng Nobyembre")).toMatchObject({ from: "2026-11-15" });
  expect(day("January 3")).toMatchObject({ from: "2027-01-03" });
  expect(day("2026-12-24")).toMatchObject({ from: "2026-12-24" });
  expect(day("12/25")).toMatchObject({ from: "2026-12-25" });
  expect(day("nothing dated here")).toBeNull();
  // An impossible date is not a date.
  expect(day("Feb 30")).toBeNull();
});

test("the 31st in a thirty-day month is the next month's 31st, never a rolled-over 1st", () => {
  // Asked on 28 October for "the 31st": this month has it.
  expect(resolveRange("the 31st", "2026-10-28")).toMatchObject({ from: "2026-10-31" });
  // Asked on 1 November: November has no 31st, so December's, not 1 December.
  expect(resolveRange("the 31st", "2026-11-01")).toMatchObject({ from: "2026-12-31" });
});

test("a weekend asked on a Sunday is just today", () => {
  expect(resolveRange("this weekend", "2026-11-01")).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
});

/* ---------------------------------------------------------------- names */

test("members resolve by first name, case-insensitively, and by full name", () => {
  expect(resolveMember("what is LIA's allergy", ctx.members)).toBe("Lia Santos");
  expect(resolveMember("gamot ni lolo", ctx.members)).toBe("Lolo Pepe Santos");
  expect(resolveMember("birthday ni Yaya Marites", ctx.members)).toBe("Yaya Marites");
  expect(resolveMember("what did we spend", ctx.members)).toBeNull();
  // "Santos" alone is every member; a surname is not a first name.
  expect(resolveMember("santos", ctx.members)).toBeNull();
});

/* ------------------------------------------------------------- phrasing */

const unpaid = [
  { name: "Meralco", amount: 3200, due_date: "2026-11-15", status: "unpaid" },
  { name: "Maynilad", amount: 850, due_date: "2026-10-20", status: "unpaid" },
  { name: "Globe Fiber", amount: 1299, due_date: "2026-10-30", status: "unpaid" },
];

const moneyResult = {
  currency: "PHP",
  accounts: [
    { name: "GCash", institution: "GCash", scope: "joint", balance: 4250.5 },
    { name: "BPI Savings", institution: "BPI", scope: "your own", balance: 120000 },
  ],
  combined_balance: 124250.5,
  this_month_in: 60000,
  this_month_out: 23500,
  this_month_out_by_category: { Groceries: 8200, Utilities: 4300, Dining: 2500, Transfer: 5000, Goal: 3500 },
  this_month_out_by_member: { "Ana Santos": 9000, "Ben Santos": 6000, Family: 3500 },
  budgets_this_month: { total: 30000, by_category: { Groceries: 10000, Utilities: 5000, Dining: 3000, Transport: 12000 } },
  unpaid_bills: unpaid,
  goals: [],
  assets_total: 500000,
  liabilities_total: 150000,
  net_worth: 474250.5,
  pending_confirmations: 0,
};

test("when a bill is due: the bill found by its everyday name, with the amount and how far off", () => {
  const en = m("When is the electric bill due?");
  expect(en.say(moneyResult)).toBe("Meralco (₱3,200) is due Sun 15 Nov (in 18 days).");
  const tl = m("kailan due ang kuryente?");
  expect(tl.say(moneyResult)).toBe("Due ang Meralco (₱3,200) sa Sun 15 Nov (18 days pa).");
  // One already past says so.
  expect(said("when is the water bill due", moneyResult)).toBe("Maynilad (₱850) was due Tue 20 Oct (8 days ago).");
  // "How much" is the same answer: the amount and the day.
  expect(said("How much is the Meralco bill?", moneyResult)).toBe("Meralco (₱3,200) is due Sun 15 Nov (in 18 days).");
  // Internet by the name on the bill itself.
  expect(said("when is globe due", moneyResult)).toContain("Globe Fiber (₱1,299) is due Fri 30 Oct");
  // Nothing by that name.
  expect(said("when is the netflix bill due", moneyResult)).toContain('No unpaid bill called "netflix"');
});

test("overdue, owed, and every unpaid bill", () => {
  expect(said("any overdue bills?", moneyResult)).toBe("Overdue (1): Maynilad ₱850, due Tue 20 Oct (8 days ago). Total ₱850.");
  expect(said("may overdue ba tayo na bill?", { ...moneyResult, unpaid_bills: [] })).toBe("Walang overdue na bill.");
  expect(said("How much do we owe?", moneyResult)).toBe("Unpaid bills: ₱5,349 (3). Loans and other debts: ₱150,000.");
  expect(said("Any bills due?", moneyResult)).toBe("Unpaid (3): Maynilad ₱850 Tue 20 Oct; Globe Fiber ₱1,299 Fri 30 Oct; Meralco ₱3,200 Sun 15 Nov. Total ₱5,349.");
});

test("bills in a range come from get_schedule, paid ones left out", () => {
  const r = m("What's due this week?");
  const result = { activities: [], events: [], bills_due: [{ name: "Globe Fiber", amount: 1299, due_date: "2026-10-30", status: "unpaid" }, { name: "Rent", amount: 15000, due_date: "2026-10-31", status: "paid" }], meals: [], goal_deadlines: [] };
  expect(line(r.say(result))).toBe("Due this week: Globe Fiber ₱1,299 Fri 30 Oct. Total ₱1,299.");
  expect(line(r.say({ ...result, bills_due: [] }))).toBe("Nothing due this week.");
  expect(said("how much is due this week", result)).toBe("Due this week: ₱1,299 (Globe Fiber ₱1,299 Fri 30 Oct).");
  expect(said("may due ba bukas", { ...result, bills_due: [] })).toBe("Walang due bukas (Thu 29 Oct).");
});

test("spending this month: by category, in total with the top three, and by member; transfers and goals are not spending", () => {
  expect(said("How much did we spend on groceries this month?", moneyResult)).toBe("Groceries in October so far: ₱8,200.");
  expect(said("magkano nagastos natin sa kuryente this month?", moneyResult)).toBe("Utilities ngayong October: ₱4,300.");
  expect(said("How much have we spent this month?", moneyResult)).toBe("Spent in October so far: ₱15,000. Top: Groceries ₱8,200, Utilities ₱4,300, Dining ₱2,500.");
  expect(said("What did Ana spend this month?", moneyResult)).toBe("Ana's spending in October so far: ₱9,000 (from accounts you can see).");
  expect(said("magkano nagastos ni ben?", moneyResult)).toBe("Nagastos ni Ben ngayong October: ₱6,000 (sa mga account na nakikita mo).");
  // A category with nothing spent is zero, not a guess.
  expect(said("how much did we spend on travel this month", moneyResult)).toBe("Travel in October so far: ₱0.");
});

test("what's left in the budget, overall and per category, over or not, or no budget at all", () => {
  expect(said("What's left in the budget?", moneyResult)).toBe("₱15,000 left of October's ₱30,000 budget (₱15,000 spent).");
  expect(said("Magkano natitira sa groceries budget?", moneyResult)).toBe("₱1,800 pa ang natitira sa ₱10,000 Groceries budget (₱8,200 nagastos).");
  const over = { ...moneyResult, this_month_out_by_category: { Groceries: 12000 } };
  expect(said("what's left in the groceries budget", over)).toBe("Groceries is over by ₱2,000: ₱12,000 spent of ₱10,000.");
  const none = { ...moneyResult, budgets_this_month: { total: 0, by_category: {} } };
  expect(said("How much is left this month?", none)).toBe("No budget set for October. In so far: ₱60,000, out: ₱23,500, so ₱36,500 of this month's money in is left.");
  expect(said("how much is left in the dining budget", none)).toBe("No Dining budget set for October. Spent so far: ₱2,500.");
});

test("balances: one account by name, every account, net worth", () => {
  expect(said("How much is in GCash?", moneyResult)).toBe("GCash: ₱4,250.50.");
  expect(said("magkano laman ng bpi?", moneyResult)).toBe("BPI Savings: ₱120,000.");
  expect(said("Maya balance", moneyResult)).toBe('No account called "maya" that you can see. Accounts: GCash, BPI Savings.');
  expect(said("How much cash do we have?", moneyResult)).toBe("Cash across 2 accounts: ₱124,250.50 (GCash ₱4,250.50, BPI Savings ₱120,000).");
  expect(said("What's our net worth?", moneyResult)).toBe("Net worth: ₱474,250.50 (cash ₱124,250.50, assets ₱500,000, debts ₱150,000).");
});

const scheduleResult = {
  activities: [
    { title: "Dentist", when: "2026-10-29T01:00:00.000Z", location: "Makati Med", who: ["Lia Santos"] },
    { title: "Grocery run", when: "2026-10-29T09:00:00.000Z", location: null, who: "whole family" },
  ],
  events: [{ title: "Lolo Pepe's birthday", event_date: "2026-10-29", kind: "birthday" }],
  bills_due: [{ name: "Globe Fiber", amount: 1299, due_date: "2026-10-29", status: "unpaid" }],
  meals: [{ dish: "Adobo", plan_date: "2026-10-29" }],
  goal_deadlines: [],
};

test("what's on a day: activities at the household's clock, events, bills, the meal; a person's view keeps their own and the whole family's", () => {
  expect(said("What's on tomorrow?", scheduleResult)).toBe(
    "Tomorrow (Thu 29 Oct): 09:00 Dentist (Lia), Makati Med; 17:00 Grocery run; Globe Fiber due ₱1,299; Lolo Pepe's birthday (birthday); meal: Adobo.",
  );
  expect(said("anong meron bukas?", { activities: [], events: [], bills_due: [], meals: [], goal_deadlines: [] })).toBe("Walang nakaschedule bukas (Thu 29 Oct).");
  expect(said("what's on for Lia tomorrow", scheduleResult)).toBe("Tomorrow (Thu 29 Oct) for Lia: 09:00 Dentist (Lia), Makati Med; 17:00 Grocery run.");
  // A range names the day on each line.
  expect(said("what's on this week", { ...scheduleResult, events: [], bills_due: [], meals: [] })).toBe("This week: Thu 29 Oct: 09:00 Dentist (Lia), Makati Med; Thu 29 Oct: 17:00 Grocery run.");
});

test("when is something: the next activity, event or meal by that name", () => {
  const r = m("When is the dentist?");
  expect(line(r.say({ activities: [{ id: "1", title: "Dentist", start_at: "2026-10-29T01:00:00.000Z", location: "Makati Med" }] }))).toBe("Dentist: Thu 29 Oct 09:00, Makati Med (tomorrow).");
  expect(line(r.say({ events: [{ id: "2", title: "Dentist follow-up", event_date: "2026-11-12", kind: "health" }] }))).toBe("Dentist follow-up: Thu 12 Nov (in 15 days).");
  expect(line(r.say({ matches: "nothing found" }))).toBe('Nothing coming up called "dentist" in Kin\'s plans.');
  // A past activity is not "when is".
  expect(line(r.say({ activities: [{ id: "1", title: "Dentist", start_at: "2026-10-01T01:00:00.000Z", location: null }] }))).toContain("Nothing coming up");
});

test("meals: tonight, tomorrow, the week", () => {
  const day = { activities: [], events: [], bills_due: [], meals: [{ dish: "Sinigang", plan_date: "2026-10-28" }], goal_deadlines: [] };
  expect(said("What's for dinner?", day)).toBe("Tonight (Wed 28 Oct): Sinigang.");
  expect(said("anong ulam ngayon?", day)).toBe("Ulam ngayon (Wed 28 Oct): Sinigang.");
  expect(said("anong ulam bukas?", { ...day, meals: [] })).toBe("Walang nakaplanong ulam bukas (Thu 29 Oct).");
  expect(said("what are the meals this week", { ...day, meals: [{ dish: "Sinigang", plan_date: "2026-10-28" }, { dish: "Adobo", plan_date: "2026-10-29" }] })).toBe("Meals this week: Wed 28 Oct Sinigang; Thu 29 Oct Adobo.");
});

test("the shopping list: what is still to buy, with quantities", () => {
  const r = m("What's on the list?");
  const result = { shopping_list: [{ name: "milk", quantity: null, unit: null, section: "Dairy", checked: false }, { name: "chicken", quantity: 2, unit: "kg", section: "Meat", checked: false }, { name: "rice", quantity: 1, unit: "sack", section: "Pantry", checked: true }], still_to_buy: 2, meals_this_week: [] };
  expect(line(r.say(result))).toBe("To buy (2): milk, 2 kg chicken.");
  expect(said("anong nasa listahan?", { shopping_list: [], still_to_buy: 0, meals_this_week: [] })).toBe("Walang laman ang list.");
});

const familyResult = {
  members: [
    { full_name: "Ana Santos", relationship: "mother", role: "parent", dob: "1988-05-02", status: "active" },
    { full_name: "Ben Santos", relationship: "father", role: "parent", dob: null, status: "active" },
    { full_name: "Lia Santos", relationship: "daughter", role: "child_self", dob: "2016-03-04", status: "active" },
  ],
  health_due: [{ who: "Lia Santos", what: "Dental check-up", when: "2026-11-02", status: "due_soon" }],
};

test("who is in the family, a birthday, an age, a missing date of birth, and the checks due", () => {
  expect(said("Who is in the family?", familyResult)).toBe("3 in the household: Ana (mother), Ben (father), Lia (daughter).");
  expect(said("When is Lia's birthday?", familyResult)).toBe("Lia's birthday is 4 March: turning 11 on Thu 4 Mar (in 127 days).");
  expect(said("kailan birthday ni ana?", familyResult)).toBe("Birthday ni Ana: 2 May, magi-39 sa Sun 2 May (186 days pa).");
  expect(said("How old is Lia?", familyResult)).toBe("Lia is 10, turning 11 on Thu 4 Mar (in 127 days).");
  expect(said("when is Ben's birthday", familyResult)).toBe("Ben's date of birth isn't recorded in Kin. Family → Ben → Edit adds it.");
  expect(said("Who has a checkup?", familyResult)).toBe("Due: Lia: Dental check-up, Mon 2 Nov.");
  expect(said("When is Lia's checkup?", familyResult)).toBe("Due: Lia: Dental check-up, Mon 2 Nov.");
  expect(said("kailan check-up ni Ana?", familyResult)).toBe("Walang due na health check si Ana.");
  expect(said("sino may check-up?", { ...familyResult, health_due: [] })).toBe("Walang due na health check.");
});

test("a health fact, read from the get_health answer as healthAnswer shapes it; a tool refusal is relayed as it is", () => {
  const healthResult = {
    who: "Lia Santos",
    allergies: "Peanuts, amoxicillin",
    blood_type: "O+",
    medicines_now: [{ name: "Cetirizine", dose: "5 mg", times: ["20:00"] }, { name: "Salbutamol", dose: null, times: "as needed", notes: "when wheezing" }],
    usual_doctor: "Dr. Reyes",
    hmo_or_insurance: "not recorded",
    who_to_call: [{ name: "Ana Santos", relationship: "mother", phone: "0917 000 0000" }],
  };
  expect(said("What is Lia's allergy?", healthResult)).toBe("Lia's allergies: Peanuts, amoxicillin.");
  expect(said("Ano ang blood type ni Lia?", healthResult)).toBe("Blood type ni Lia: O+.");
  expect(said("What medicines does Lia take?", healthResult)).toBe("Lia's medicines now: Cetirizine 5 mg at 20:00; Salbutamol as needed (when wheezing).");
  expect(said("Who is Lia's doctor?", healthResult)).toBe("Lia's usual doctor: Dr. Reyes.");
  expect(said("Lia's HMO?", healthResult)).toBe("Lia's HMO or insurance: not recorded.");
  expect(said("who to call for Lia in an emergency", healthResult)).toBe("Lia's who to call: Ana Santos (mother) 0917 000 0000.");
  expect(said("What is Lia's allergy?", { error: "Health details are for the household's grown-ups." })).toBe("Health details are for the household's grown-ups.");
});

test("adds confirm in a few words, and a tool's refusal comes back as it is", () => {
  expect(said("Add milk and eggs to the list", { added: "shopping items", items: [{ name: "milk", section: "Dairy" }, { name: "eggs", section: "Dairy" }] })).toBe("Added to the list: milk, eggs.");
  expect(said("pa-add ng 2 kilo manok", { added: "shopping items", items: [{ name: "manok", quantity: "2 kg", section: "Meat" }] })).toBe("Na-add sa list: 2 kg manok.");
  expect(said("Add Meralco bill 3200 due Nov 15", { added: "bill", name: "Meralco", amount: 3200, due_date: "2026-11-15" })).toBe("Added Meralco, ₱3,200 due Sun 15 Nov.");
  expect(said("pa-add ng bill: Globe 1,299 due sa 20", { added: "bill" })).toBe("Na-add ang Globe, ₱1,299, due sa Fri 20 Nov.");
  expect(said("Add milk to the list", { error: "No items to add." })).toBe("No items to add.");
});

/* ----------------------------------------------- the lookups' phrasing */

test("past ranges: last month, a month by name, the last N months, last week, this year", () => {
  expect(pastRange("last month", ctx.today)).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
  expect(pastRange("in September", ctx.today)).toMatchObject({ from: "2026-09-01", to: "2026-09-30", label: { en: "September" } });
  // A month not yet come this year is last year's.
  expect(pastRange("in December", ctx.today)).toMatchObject({ from: "2025-12-01", to: "2025-12-31", label: { en: "December 2025" } });
  expect(pastRange("noong Agosto", ctx.today)).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
  expect(pastRange("last 3 months", ctx.today)).toMatchObject({ from: "2026-07-01", to: "2026-09-30" });
  expect(pastRange("last week", ctx.today)).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
  expect(pastRange("this year", ctx.today)).toMatchObject({ from: "2026-01-01", to: "2026-10-28" });
  expect(pastRange("last year", ctx.today)).toMatchObject({ from: "2025-01-01", to: "2025-12-31" });
  // This month is get_money's; "may" alone is the Filipino "there is".
  expect(pastRange("in October", ctx.today)).toBeNull();
  expect(pastRange("may due ba", ctx.today)).toBeNull();
  expect(pastRange("in May", ctx.today)).toMatchObject({ from: "2026-05-01" });
});

test("goals: one by name with its progress, or the list", () => {
  const withGoals = { ...moneyResult, goals: [{ title: "Baguio trip", target_amount: 20000, current_amount: 12000, target_date: "2026-12-31" }, { title: "Emergency fund", target_amount: 100000, current_amount: 35000, target_date: null }] };
  expect(said("How far is the Baguio fund?", withGoals)).toBe("Baguio trip: ₱12,000 of ₱20,000 (60%), target Thu 31 Dec.");
  expect(said("what are our savings goals", withGoals)).toBe("Goals (2): Baguio trip: ₱12,000 of ₱20,000 (60%), target Thu 31 Dec; Emergency fund: ₱35,000 of ₱100,000 (35%).");
  expect(said("how is the car fund", withGoals)).toBe('No goal called "car". Goals: Baguio trip, Emergency fund.');
});

const debtsResult = {
  liabilities: [{ name: "Car loan", balance: 320000 }, { name: "Credit card", balance: 18500 }],
  liabilities_total: 338500,
  owed_to_us: [{ person: "Tita Baby", amount: 5000, paid: 2000, left: 3000, due: "2026-11-30" }],
  we_owe: [],
};

test("debts: a loan by name, who owes the family, whom the family owes", () => {
  expect(said("How much do we owe on the car loan?", debtsResult)).toBe("Car loan: ₱320,000 left.");
  expect(said("who owes us", debtsResult)).toBe("Owed to us (1): Tita Baby ₱3,000 (due Mon 30 Nov). Total ₱3,000.");
  expect(said("sino may utang sa atin", debtsResult)).toBe("May utang sa atin (1): Tita Baby ₱3,000 (due Mon 30 Nov). Total ₱3,000.");
  expect(said("how much does Tita Baby owe us", debtsResult)).toBe("Owed to us (1): Tita Baby ₱3,000 (due Mon 30 Nov). Total ₱3,000.");
  expect(said("do I owe anyone", debtsResult)).toBe("No lending owed to anyone recorded in Kin.");
  expect(said("what loans do we have", debtsResult)).toBe("Loans and debts (2): Car loan ₱320,000; Credit card ₱18,500. Total ₱338,500.");
});

test("subscriptions: the list with monthly and yearly totals, or one by name", () => {
  const subs = { charges: [{ name: "Netflix", amount: 549, repeat: "monthly", per_month: 549, next: "2026-11-10", overdue: false }, { name: "Spotify", amount: 194, repeat: "monthly", per_month: 194, next: "2026-11-02", overdue: false }], charges_per_month: 743, charges_per_year: 8916, income: [], income_per_year: 0 };
  expect(said("what subscriptions do we pay", subs)).toBe("2 repeating charges, about ₱743 a month (₱8,916 a year): Netflix ₱549 monthly; Spotify ₱194 monthly.");
  expect(said("when is Netflix next charged", subs)).toBe("Netflix ₱549 monthly, next Tue 10 Nov.");
  expect(said("magkano ang subscriptions natin", subs)).toBe("2 paulit-ulit na bayad, mga ₱743 kada buwan (₱8,916 kada taon): Netflix ₱549 buwan-buwan; Spotify ₱194 buwan-buwan.");
});

test("documents: one by name for a person, and what expires soon", () => {
  const docs = { documents: [{ title: "Passport", type: "passport", whose: "Lia Santos", folder: "IDs", expires: "2027-03-12", days_left: 135 }, { title: "Passport", type: "passport", whose: "Ana Santos", folder: "IDs", expires: "2026-10-01", days_left: -27 }] };
  expect(said("when does Lia's passport expire", docs)).toBe("Lia's Passport: expires Fri 12 Mar (in 135 days).");
  expect(said("what documents expire soon", docs)).toBe("Expiring: Lia's Passport: expires Fri 12 Mar (in 135 days); Ana's Passport: expired Thu 1 Oct (27 days ago).");
  expect(said("what documents expire soon", { documents: [] })).toBe("Nothing expires in the next six months.");
  expect(said("is the car registration still valid", { documents: [] })).toBe('No document called "car registration" in the Vault.');
});

const tasksResult = {
  from: "2026-10-28",
  to: "2026-10-28",
  tasks: [
    { title: "Dishes", kind: "chore", date: "2026-10-28", time: "19:00", who: ["Lia Santos"], status: "done" },
    { title: "Trash", kind: "chore", date: "2026-10-28", time: null, who: ["Ben Santos"], status: "not yet" },
    { title: "Homework", kind: "chore", date: "2026-10-28", time: null, who: ["Lia Santos"], status: "not yet" },
  ],
  behind_on: [{ title: "Water plants", who: ["Ben Santos"], dates: ["2026-10-24"] }],
};

test("chores: the day's list, who hasn't done theirs, did one person, whose turn", () => {
  expect(said("what are the chores today", tasksResult)).toBe("Today (3): Dishes (Lia) 19:00 done; Trash (Ben); Homework (Lia). Behind: Water plants (Sat 24 Oct).");
  expect(said("who hasn't done their chores", tasksResult)).toBe("Not yet today (2): Trash (Ben); Homework (Lia). Behind: Water plants (Sat 24 Oct).");
  expect(said("did Ben do his chores", { ...tasksResult, tasks: tasksResult.tasks.filter((x) => x.who[0] === "Ben Santos"), behind_on: [] })).toBe("Ben today: done nothing yet; not yet Trash.");
  expect(said("did Lia do her chores", { ...tasksResult, tasks: [tasksResult.tasks[0]], behind_on: [] })).toBe("Yes: Lia did Dishes today.");
  expect(said("whose turn is it to wash the dishes", tasksResult)).toBe("Dishes: Lia (done).");
  expect(said("sino hindi pa tapos sa chores", { ...tasksResult, tasks: [tasksResult.tasks[0]], behind_on: [] })).toBe("Tapos na lahat ngayon.");
});

test("the piggy bank and the points", () => {
  const jars = { who: "Lia Santos", jars: { gastos: 500, ipon: 600, bigay: 150, total: 1250 }, weekly_allowance: 200, points_earned: 150, points_spent: 30, points_balance: 120 };
  expect(said("how much is in Lia's piggy bank", jars)).toBe("Lia's piggy bank: ₱1,250 (gastos ₱500, ipon ₱600, bigay ₱150), ₱200 a week; 120 points (30 spent).");
  expect(said("magkano ang alkansya ni Lia", jars)).toBe("Alkansya ni Lia: ₱1,250 (gastos ₱500, ipon ₱600, bigay ₱150), ₱200 kada linggo; 120 points (30 nagastos).");
  expect(said("how many points does Ben have", { who: "Ben Santos", jars: null, points_earned: 40, points_spent: 0, points_balance: 40 })).toBe("Ben: 40 points.");
});

test("who is coming to an event", () => {
  const guests = { event: "Lia's party", date: "2026-10-31", going: ["Ana Santos", "Ben Santos", "Lia Santos"], maybe: ["Lolo Pepe Santos"], no: [], guests_going: [{ name: "Tita Baby", heads: 3 }], guests_maybe: [], guests_not_answered: ["Ninong Carlo", "Ninang Eds"], heads_going: 6, other_events: [] };
  expect(said("who's coming to Lia's party", guests)).toBe("Lia's party (Sat 31 Oct): going 6 (Ana, Ben, Lia, Tita Baby ×3); maybe Lolo; 2 not answered.");
  expect(said("how many are coming Saturday", { matches: "no event found" })).toBe("No event on Sat 31 Oct in Kin.");
});

test("spending in a past range: total with the top three, a category, a person, money in", () => {
  const sept = { from: "2026-09-01", to: "2026-09-30", currency: "PHP", spent: 45200, money_in: 70000, by_category: { Groceries: 12000, Utilities: 8000, Dining: 6000, Transfer: 10000 }, by_member: { "Ana Santos": 20000, Family: 25200 } };
  expect(said("How much did we spend last month?", sept)).toBe("Spent last month: ₱45,200. Top: Groceries ₱12,000, Utilities ₱8,000, Dining ₱6,000.");
  expect(said("how much did we spend on groceries in September", sept)).toBe("Groceries September: ₱12,000.");
  expect(said("what did Ana spend last month", sept)).toBe("Ana's spending last month: ₱20,000 (from accounts you can see).");
  expect(said("how much did we earn last month", sept)).toBe("Money in last month: ₱70,000; out: ₱45,200.");
  expect(said("magkano nagastos natin noong nakaraang buwan", sept)).toBe("Nagastos noong nakaraang buwan: ₱45,200. Pinakamalaki: Groceries ₱12,000, Utilities ₱8,000, Dining ₱6,000.");
});

test("the journal: on this day, a range, the latest", () => {
  const entries = { entries: [{ title: "Lia's first day of school", date: "2025-10-28", note: null, milestone: true }, { title: "Lolo's checkup went well", date: "2024-10-28", note: "All clear.", milestone: false }] };
  expect(said("what happened on this day", entries)).toBe("Tue 28 Oct 2025: Lia's first day of school ★; Mon 28 Oct 2024: Lolo's checkup went well.");
  expect(said("what happened on this day", { entries: [] })).toBe("Nothing in the journal on this day in past years.");
  expect(said("what did we write in the journal last week", { entries: [] })).toBe("Nothing in the journal last week.");
});

test("where is: the matching records by kind; do we have: the pantry and the list", () => {
  const found = { documents: [{ id: "1", title: "Lia birth certificate", expires_at: null, doc_type: "certificate" }], accounts: [{ id: "2", name: "Birth fund", institution: "BPI" }] };
  expect(said("where is the birth certificate", found)).toBe("Document: Lia birth certificate (Family → Vault); Account: Birth fund (BPI).");
  expect(said("where is the birth certificate", { matches: "nothing found" })).toBe('Nothing called "birth certificate" in Kin.');
  const household = { shopping_list: [{ name: "milk", quantity: null, unit: null, section: "Dairy", checked: false }], still_to_buy: 1, meals_this_week: [], pantry: [{ name: "Rice", quantity: 5, unit: "kg", running_low: false }, { name: "Toyo", quantity: null, unit: null, running_low: true }] };
  expect(said("do we have rice", household)).toBe("In the pantry: Rice 5 kg.");
  expect(said("are we out of milk", household)).toBe("None in the pantry; on the list: milk.");
  expect(said("meron pa ba tayong toyo", household)).toBe("Sa pantry: Toyo (paubos na).");
  expect(said("do we have any eggs left", household)).toBe("No eggs in the pantry, and it isn't on the list.");
});

test("the language of the answer follows the question", () => {
  expect(m("When is the electric bill due?").lang).toBe("en");
  expect(m("Kailan due ang Meralco?").lang).toBe("tl");
  expect(m("Magkano nagastos natin sa groceries this month?").lang).toBe("tl");
});

test("without a key and without a rule, Kin says what it can answer by itself: three examples, picked by the words in the question", () => {
  const en = rulesOnlyLine("Help me plan the week");
  expect(en).toContain("nothing was sent anywhere");
  expect(en).toContain("When is the electric bill due?");
  expect(en).toContain("What's on tomorrow?");
  expect(en).toContain("Add milk to the list");
  // Money words hear money examples; food words the list and meals; people words the family.
  expect(rulesOnlyLine("Should we move money to savings?")).toContain("How much did we spend on groceries this month?");
  expect(rulesOnlyLine("What should we cook this week?")).toContain("What's for dinner tomorrow?");
  expect(rulesOnlyLine("Is Lia's medicine working?")).toContain("What is Lia's allergy?");
  const tl = rulesOnlyLine("Tulungan mo ako magplano ng linggo");
  expect(tl).toContain("Kailan due ang Meralco?");
  expect(tl).toContain("walang ipinadala");
  expect(rulesOnlyLine("Magkano dapat ang ipon namin?")).toContain("Magkano ang laman ng GCash?");
  expect(RULES_NOTE).toContain("Nothing was sent anywhere");
});
