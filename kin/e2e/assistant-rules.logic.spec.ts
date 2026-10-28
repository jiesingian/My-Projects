import { test, expect } from "@playwright/test";
import { matchRule, resolveRange, resolveMember, rulesOnlyLine, RULES_NOTE, type RuleContext } from "@/lib/assistant/rules";

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
};

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
];

for (const row of TABLE) {
  test(`"${row.ask}" → ${row.tool}${row.input ? " " + JSON.stringify(row.input) : ""}`, () => {
    const m = matchRule(row.ask, ctx);
    expect(m, "matched").not.toBeNull();
    expect(m!.tool).toBe(row.tool);
    if (row.input) expect(m!.input).toEqual(row.input);
    if (row.rule) expect(m!.rule).toBe(row.rule);
    if (row.lang) expect(m!.lang).toBe(row.lang);
  });
}

/* ------------------------------------------------- what stays the model's */

const FOR_THE_MODEL = [
  "Help me plan the week",
  "Should we buy a car this year?",
  "Add milk to the list and then tell me what's for dinner",
  "Why is our electric bill so high?",
  "add bill meralco",
  "add Meralco bill due Nov 15",
  "Record 500 from GCash for lunch",
  "Delete the water bill",
  "How much did we spend last month?",
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
  "Add dentist on Friday at 3pm",
  "add water bill 900",
  // A price, not a balance.
  "How much is 3 kilos of rice?",
  "Did we pay Meralco?",
  "Thanks!",
];

for (const ask of FOR_THE_MODEL) {
  test(`"${ask}" is left to the model`, () => {
    expect(matchRule(ask, ctx)).toBeNull();
  });
}

test("a health question from someone who may not ask is never a rule's", () => {
  expect(matchRule("What is Lia's allergy?", { ...ctx, canAskHealth: false })).toBeNull();
  expect(matchRule("Anong gamot ni Lolo?", { ...ctx, canAskHealth: false })).toBeNull();
  // The same question from a grown-up still is.
  expect(matchRule("What is Lia's allergy?", ctx)?.tool).toBe("get_health");
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
  const en = matchRule("When is the electric bill due?", ctx)!;
  expect(en.say(moneyResult)).toBe("Meralco (₱3,200) is due Sun 15 Nov (in 18 days).");
  const tl = matchRule("kailan due ang kuryente?", ctx)!;
  expect(tl.say(moneyResult)).toBe("Due ang Meralco (₱3,200) sa Sun 15 Nov (18 days pa).");
  // One already past says so.
  expect(matchRule("when is the water bill due", ctx)!.say(moneyResult)).toBe("Maynilad (₱850) was due Tue 20 Oct (8 days ago).");
  // "How much" is the same answer: the amount and the day.
  expect(matchRule("How much is the Meralco bill?", ctx)!.say(moneyResult)).toBe("Meralco (₱3,200) is due Sun 15 Nov (in 18 days).");
  // Internet by the name on the bill itself.
  expect(matchRule("when is globe due", ctx)!.say(moneyResult)).toContain("Globe Fiber (₱1,299) is due Fri 30 Oct");
  // Nothing by that name.
  expect(matchRule("when is the netflix bill due", ctx)!.say(moneyResult)).toContain('No unpaid bill called "netflix"');
});

test("overdue, owed, and every unpaid bill", () => {
  expect(matchRule("any overdue bills?", ctx)!.say(moneyResult)).toBe("Overdue (1): Maynilad ₱850, due Tue 20 Oct (8 days ago). Total ₱850.");
  expect(matchRule("may overdue ba tayo na bill?", ctx)!.say({ ...moneyResult, unpaid_bills: [] })).toBe("Walang overdue na bill.");
  expect(matchRule("How much do we owe?", ctx)!.say(moneyResult)).toBe("Unpaid bills: ₱5,349 (3). Loans and other debts: ₱150,000.");
  expect(matchRule("Any bills due?", ctx)!.say(moneyResult)).toBe("Unpaid (3): Maynilad ₱850 Tue 20 Oct; Globe Fiber ₱1,299 Fri 30 Oct; Meralco ₱3,200 Sun 15 Nov. Total ₱5,349.");
});

test("bills in a range come from get_schedule, paid ones left out", () => {
  const m = matchRule("What's due this week?", ctx)!;
  const result = { activities: [], events: [], bills_due: [{ name: "Globe Fiber", amount: 1299, due_date: "2026-10-30", status: "unpaid" }, { name: "Rent", amount: 15000, due_date: "2026-10-31", status: "paid" }], meals: [], goal_deadlines: [] };
  expect(m.say(result)).toBe("Due this week: Globe Fiber ₱1,299 Fri 30 Oct. Total ₱1,299.");
  expect(m.say({ ...result, bills_due: [] })).toBe("Nothing due this week.");
  expect(matchRule("how much is due this week", ctx)!.say(result)).toBe("Due this week: ₱1,299 (Globe Fiber ₱1,299 Fri 30 Oct).");
  expect(matchRule("may due ba bukas", ctx)!.say({ ...result, bills_due: [] })).toBe("Walang due bukas (Thu 29 Oct).");
});

test("spending this month: by category, in total with the top three, and by member; transfers and goals are not spending", () => {
  expect(matchRule("How much did we spend on groceries this month?", ctx)!.say(moneyResult)).toBe("Groceries in October so far: ₱8,200.");
  expect(matchRule("magkano nagastos natin sa kuryente this month?", ctx)!.say(moneyResult)).toBe("Utilities ngayong October: ₱4,300.");
  expect(matchRule("How much have we spent this month?", ctx)!.say(moneyResult)).toBe("Spent in October so far: ₱15,000. Top: Groceries ₱8,200, Utilities ₱4,300, Dining ₱2,500.");
  expect(matchRule("What did Ana spend this month?", ctx)!.say(moneyResult)).toBe("Ana's spending in October so far: ₱9,000 (from accounts you can see).");
  expect(matchRule("magkano nagastos ni ben?", ctx)!.say(moneyResult)).toBe("Nagastos ni Ben ngayong October: ₱6,000 (sa mga account na nakikita mo).");
  // A category with nothing spent is zero, not a guess.
  expect(matchRule("how much did we spend on travel this month", ctx)!.say(moneyResult)).toBe("Travel in October so far: ₱0.");
});

test("what's left in the budget, overall and per category, over or not, or no budget at all", () => {
  expect(matchRule("What's left in the budget?", ctx)!.say(moneyResult)).toBe("₱15,000 left of October's ₱30,000 budget (₱15,000 spent).");
  expect(matchRule("Magkano natitira sa groceries budget?", ctx)!.say(moneyResult)).toBe("₱1,800 pa ang natitira sa ₱10,000 Groceries budget (₱8,200 nagastos).");
  const over = { ...moneyResult, this_month_out_by_category: { Groceries: 12000 } };
  expect(matchRule("what's left in the groceries budget", ctx)!.say(over)).toBe("Groceries is over by ₱2,000: ₱12,000 spent of ₱10,000.");
  const none = { ...moneyResult, budgets_this_month: { total: 0, by_category: {} } };
  expect(matchRule("How much is left this month?", ctx)!.say(none)).toBe("No budget set for October. In so far: ₱60,000, out: ₱23,500, so ₱36,500 of this month's money in is left.");
  expect(matchRule("how much is left in the dining budget", ctx)!.say(none)).toBe("No Dining budget set for October. Spent so far: ₱2,500.");
});

test("balances: one account by name, every account, net worth", () => {
  expect(matchRule("How much is in GCash?", ctx)!.say(moneyResult)).toBe("GCash: ₱4,250.50.");
  expect(matchRule("magkano laman ng bpi?", ctx)!.say(moneyResult)).toBe("BPI Savings: ₱120,000.");
  expect(matchRule("Maya balance", ctx)!.say(moneyResult)).toBe('No account called "maya" that you can see. Accounts: GCash, BPI Savings.');
  expect(matchRule("How much cash do we have?", ctx)!.say(moneyResult)).toBe("Cash across 2 accounts: ₱124,250.50 (GCash ₱4,250.50, BPI Savings ₱120,000).");
  expect(matchRule("What's our net worth?", ctx)!.say(moneyResult)).toBe("Net worth: ₱474,250.50 (cash ₱124,250.50, assets ₱500,000, debts ₱150,000).");
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
  expect(matchRule("What's on tomorrow?", ctx)!.say(scheduleResult)).toBe(
    "Tomorrow (Thu 29 Oct): 09:00 Dentist (Lia), Makati Med; 17:00 Grocery run; Globe Fiber due ₱1,299; Lolo Pepe's birthday (birthday); meal: Adobo.",
  );
  expect(matchRule("anong meron bukas?", ctx)!.say({ activities: [], events: [], bills_due: [], meals: [], goal_deadlines: [] })).toBe("Walang nakaschedule bukas (Thu 29 Oct).");
  expect(matchRule("what's on for Lia tomorrow", ctx)!.say(scheduleResult)).toBe("Tomorrow (Thu 29 Oct) for Lia: 09:00 Dentist (Lia), Makati Med; 17:00 Grocery run.");
  // A range names the day on each line.
  expect(matchRule("what's on this week", ctx)!.say({ ...scheduleResult, events: [], bills_due: [], meals: [] })).toBe("This week: Thu 29 Oct: 09:00 Dentist (Lia), Makati Med; Thu 29 Oct: 17:00 Grocery run.");
});

test("when is something: the next activity, event or meal by that name", () => {
  const m = matchRule("When is the dentist?", ctx)!;
  expect(m.say({ activities: [{ id: "1", title: "Dentist", start_at: "2026-10-29T01:00:00.000Z", location: "Makati Med" }] })).toBe("Dentist: Thu 29 Oct 09:00, Makati Med (tomorrow).");
  expect(m.say({ events: [{ id: "2", title: "Dentist follow-up", event_date: "2026-11-12", kind: "health" }] })).toBe("Dentist follow-up: Thu 12 Nov (in 15 days).");
  expect(m.say({ matches: "nothing found" })).toBe('Nothing coming up called "dentist" in Kin\'s plans.');
  // A past activity is not "when is".
  expect(m.say({ activities: [{ id: "1", title: "Dentist", start_at: "2026-10-01T01:00:00.000Z", location: null }] })).toContain("Nothing coming up");
});

test("meals: tonight, tomorrow, the week", () => {
  const day = { activities: [], events: [], bills_due: [], meals: [{ dish: "Sinigang", plan_date: "2026-10-28" }], goal_deadlines: [] };
  expect(matchRule("What's for dinner?", ctx)!.say(day)).toBe("Tonight (Wed 28 Oct): Sinigang.");
  expect(matchRule("anong ulam ngayon?", ctx)!.say(day)).toBe("Ulam ngayon (Wed 28 Oct): Sinigang.");
  expect(matchRule("anong ulam bukas?", ctx)!.say({ ...day, meals: [] })).toBe("Walang nakaplanong ulam bukas (Thu 29 Oct).");
  expect(matchRule("what are the meals this week", ctx)!.say({ ...day, meals: [{ dish: "Sinigang", plan_date: "2026-10-28" }, { dish: "Adobo", plan_date: "2026-10-29" }] })).toBe("Meals this week: Wed 28 Oct Sinigang; Thu 29 Oct Adobo.");
});

test("the shopping list: what is still to buy, with quantities", () => {
  const m = matchRule("What's on the list?", ctx)!;
  const result = { shopping_list: [{ name: "milk", quantity: null, unit: null, section: "Dairy", checked: false }, { name: "chicken", quantity: 2, unit: "kg", section: "Meat", checked: false }, { name: "rice", quantity: 1, unit: "sack", section: "Pantry", checked: true }], still_to_buy: 2, meals_this_week: [] };
  expect(m.say(result)).toBe("To buy (2): milk, 2 kg chicken.");
  expect(matchRule("anong nasa listahan?", ctx)!.say({ shopping_list: [], still_to_buy: 0, meals_this_week: [] })).toBe("Walang laman ang list.");
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
  expect(matchRule("Who is in the family?", ctx)!.say(familyResult)).toBe("3 in the household: Ana (mother), Ben (father), Lia (daughter).");
  expect(matchRule("When is Lia's birthday?", ctx)!.say(familyResult)).toBe("Lia's birthday is 4 March: turning 11 on Thu 4 Mar (in 127 days).");
  expect(matchRule("kailan birthday ni ana?", ctx)!.say(familyResult)).toBe("Birthday ni Ana: 2 May, magi-39 sa Sun 2 May (186 days pa).");
  expect(matchRule("How old is Lia?", ctx)!.say(familyResult)).toBe("Lia is 10, turning 11 on Thu 4 Mar (in 127 days).");
  expect(matchRule("when is Ben's birthday", ctx)!.say(familyResult)).toBe("Ben's date of birth isn't recorded in Kin. Family → Ben → Edit adds it.");
  expect(matchRule("Who has a checkup?", ctx)!.say(familyResult)).toBe("Due: Lia: Dental check-up, Mon 2 Nov.");
  expect(matchRule("When is Lia's checkup?", ctx)!.say(familyResult)).toBe("Due: Lia: Dental check-up, Mon 2 Nov.");
  expect(matchRule("kailan check-up ni Ana?", ctx)!.say(familyResult)).toBe("Walang due na health check si Ana.");
  expect(matchRule("sino may check-up?", ctx)!.say({ ...familyResult, health_due: [] })).toBe("Walang due na health check.");
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
  expect(matchRule("What is Lia's allergy?", ctx)!.say(healthResult)).toBe("Lia's allergies: Peanuts, amoxicillin.");
  expect(matchRule("Ano ang blood type ni Lia?", ctx)!.say(healthResult)).toBe("Blood type ni Lia: O+.");
  expect(matchRule("What medicines does Lia take?", ctx)!.say(healthResult)).toBe("Lia's medicines now: Cetirizine 5 mg at 20:00; Salbutamol as needed (when wheezing).");
  expect(matchRule("Who is Lia's doctor?", ctx)!.say(healthResult)).toBe("Lia's usual doctor: Dr. Reyes.");
  expect(matchRule("Lia's HMO?", ctx)!.say(healthResult)).toBe("Lia's HMO or insurance: not recorded.");
  expect(matchRule("who to call for Lia in an emergency", ctx)!.say(healthResult)).toBe("Lia's who to call: Ana Santos (mother) 0917 000 0000.");
  expect(matchRule("What is Lia's allergy?", ctx)!.say({ error: "Health details are for the household's grown-ups." })).toBe("Health details are for the household's grown-ups.");
});

test("adds confirm in a few words, and a tool's refusal comes back as it is", () => {
  expect(matchRule("Add milk and eggs to the list", ctx)!.say({ added: "shopping items", items: [{ name: "milk", section: "Dairy" }, { name: "eggs", section: "Dairy" }] })).toBe("Added to the list: milk, eggs.");
  expect(matchRule("pa-add ng 2 kilo manok", ctx)!.say({ added: "shopping items", items: [{ name: "manok", quantity: "2 kg", section: "Meat" }] })).toBe("Na-add sa list: 2 kg manok.");
  expect(matchRule("Add Meralco bill 3200 due Nov 15", ctx)!.say({ added: "bill", name: "Meralco", amount: 3200, due_date: "2026-11-15" })).toBe("Added Meralco, ₱3,200 due Sun 15 Nov.");
  expect(matchRule("pa-add ng bill: Globe 1,299 due sa 20", ctx)!.say({ added: "bill" })).toBe("Na-add ang Globe, ₱1,299, due sa Fri 20 Nov.");
  expect(matchRule("Add milk to the list", ctx)!.say({ error: "No items to add." })).toBe("No items to add.");
});

test("the language of the answer follows the question", () => {
  expect(matchRule("When is the electric bill due?", ctx)!.lang).toBe("en");
  expect(matchRule("Kailan due ang Meralco?", ctx)!.lang).toBe("tl");
  expect(matchRule("Magkano nagastos natin sa groceries this month?", ctx)!.lang).toBe("tl");
});

test("without a key and without a rule, Kin says what it can answer by itself, three examples, in the member's language", () => {
  const en = rulesOnlyLine("Help me plan the week");
  expect(en).toContain("nothing was sent anywhere");
  expect(en).toContain("When is the electric bill due?");
  expect(en).toContain("How much did we spend on groceries this month?");
  expect(en).toContain("What's on tomorrow?");
  const tl = rulesOnlyLine("Tulungan mo ako magplano ng linggo");
  expect(tl).toContain("Kailan due ang Meralco?");
  expect(tl).toContain("walang ipinadala");
  expect(RULES_NOTE).toContain("Nothing was sent anywhere");
});
