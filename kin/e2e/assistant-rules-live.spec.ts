import { test, expect, type Page } from "@playwright/test";
import { restAsQa, type Rest } from "./support/qa-household";

/** Ask Kin's rule layer against a real database (28 October): every tool the
 * rules reach, run through POST /api/assistant as the signed-in sample
 * household, with no API key. The logic spec holds the matcher and the
 * phrasing from fixture results; this is the other half -- that each tool's
 * queries run (no missing column, no foreign key PostgREST cannot follow),
 * that a mark writes what it says, and that a question asked back finishes
 * on the next message.
 *
 * Writes, so it runs in smoke-private-db (a database that exists for one
 * run, e2e.yml) and not in the post-merge smoke on shared dev. Everything it
 * adds is named E2E-RULES and removed after, through the REST API as the
 * sample account, so row-level security decides what it can reach. */

const PREFIX = "E2E-RULES";
let qa: Rest | null = null;

/** What a reply must never carry: a database's words, or a tool's own
 * failure line. A plain "No unpaid bills." is a fine answer on an empty
 * household; "column foo does not exist" is not. */
const SMELLS = /\b(column|relation|does not exist|syntax error|PGRST\d*|undefined|NaN|\[object|Unknown tool|could not be read|didn't go through|Something went wrong|Bad request)\b/i;

type Reply = { reply?: string; error?: string; source?: string; choices?: string[]; pending?: unknown; actions?: string[] };

async function ask(page: Page, text: string, pending?: unknown): Promise<Reply> {
  const res = await page.request.post("/api/assistant", {
    data: { messages: [{ role: "user", content: text }], timeZone: "Asia/Manila", ...(pending ? { pending } : {}) },
  });
  const data = (await res.json()) as Reply;
  expect(res.ok(), `"${text}" -> ${res.status()} ${JSON.stringify(data)}`).toBeTruthy();
  expect(data.error, `"${text}" errored`).toBeUndefined();
  return data;
}

/** A question the rules must answer themselves, with a clean line back. */
async function answered(page: Page, text: string): Promise<string> {
  const data = await ask(page, text);
  expect(data.source, `"${text}" was not answered by the rules`).toBe("rules");
  expect(typeof data.reply).toBe("string");
  expect(data.reply!.trim().length, `"${text}" came back empty`).toBeGreaterThan(0);
  expect(data.reply, `"${text}" -> ${data.reply}`).not.toMatch(SMELLS);
  return data.reply!;
}

async function rest(): Promise<Rest> {
  qa ??= await restAsQa();
  test.skip(!qa, "Supabase details are not set; cannot check what was written.");
  return qa!;
}

async function removeOurs(table: string, column: string) {
  const r = await rest();
  const res = await r.ctx.delete(`${r.url}/rest/v1/${table}?${column}=ilike.${encodeURIComponent(PREFIX)}*`, { headers: r.headers });
  expect(res.ok(), `could not tidy ${table}: ${res.status()} ${await res.text()}`).toBeTruthy();
  const left = await r.ctx.get(`${r.url}/rest/v1/${table}?select=id&${column}=ilike.${encodeURIComponent(PREFIX)}*`, { headers: r.headers });
  expect((await left.json()) as unknown[], `${table} still holds ${PREFIX} rows`).toEqual([]);
}

async function myFirstName(): Promise<string> {
  const r = await rest();
  const user = (await (await r.ctx.get(`${r.url}/auth/v1/user`, { headers: r.headers })).json()) as { id: string };
  const res = await r.ctx.get(`${r.url}/rest/v1/members?select=full_name&auth_user_id=eq.${user.id}`, { headers: r.headers });
  const [row] = (await res.json()) as { full_name: string }[];
  return row.full_name.split(" ")[0];
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  if (!qa) return;
  await removeOurs("buy_items", "name");
  await removeOurs("bills", "name");
});

test("every read the rules make runs against the database and answers plainly", async ({ page }) => {
  test.setTimeout(240_000);
  const me = await myFirstName();
  const questions = [
    // get_money
    "When is the electric bill due?",
    "Any bills due?",
    "Any overdue bills?",
    "How much do we owe?",
    "How much did we spend on groceries this month?",
    "How much have we spent this month?",
    "What's left in the budget?",
    "How much cash do we have?",
    "How much is in GCash?",
    "What's our net worth?",
    "How far is the emergency fund?",
    "how much did we earn this month",
    // get_schedule
    "What's on today?",
    "What's on this week?",
    "What's due this week?",
    "What's for dinner?",
    "paid bills this month",
    // get_household
    "What's on the list?",
    "what's in the pantry",
    "do we have rice",
    // get_family
    "Who is in the family?",
    `When is ${me}'s birthday?`,
    "Who has a checkup?",
    "upcoming birthdays",
    // get_health (a grown-up's own facts; a child hears the tool's refusal)
    `What is ${me}'s allergy?`,
    `What medicines does ${me} take?`,
    "who should I call in an emergency",
    // search
    "where is the passport",
    "When is the dentist?",
    "Is Meralco paid?",
    // get_tasks
    "what are the chores today",
    "who hasn't done their chores",
    // get_documents
    "what documents expire soon",
    "when does the passport expire",
    // get_debts
    "who owes us",
    "what loans do we have",
    // get_subscriptions
    "what subscriptions do we pay",
    // get_journal
    "what happened on this day",
    "latest journal entry",
    // get_spending
    "how much did we spend last month",
    "how much did we spend in the last 3 months",
    // get_allowance (a grown-up asking about themself hears the tool say so)
    `how much is in ${me}'s piggy bank`,
    // get_event_guests
    "who's coming to the next party",
    // no record at all
    "what day is it today",
    "when is christmas",
  ];
  for (const q of questions) {
    const reply = await answered(page, q);
    test.info().annotations.push({ type: "answer", description: `${q} -> ${reply}` });
  }
});

test("without a key, a question the rules cannot read gets the line that says what Kin answers", async ({ page }) => {
  const data = await ask(page, "Help me plan the week");
  // In CI there is no ANTHROPIC_API_KEY; with one, the model answers instead.
  if (data.source === "off") {
    expect(data.reply).toContain("nothing was sent anywhere");
  } else {
    expect(["model", "rules"]).toContain(data.source);
  }
});

test("a list item is added, ticked off, put back, and found by name", async ({ page }) => {
  const item = `${PREFIX} milk`;
  expect(await answered(page, `add ${item} to the list`)).toBe(`Added to the list: ${item}.`);
  const r = await rest();
  const read = async () => (await (await r.ctx.get(`${r.url}/rest/v1/buy_items?select=name,checked,cleared&name=eq.${encodeURIComponent(item)}`, { headers: r.headers })).json()) as { name: string; checked: boolean; cleared: boolean }[];
  expect(await read()).toEqual([{ name: item, checked: false, cleared: false }]);
  expect(await answered(page, `bought ${item}`)).toBe(`Ticked ${item} off the list.`);
  expect((await read())[0].checked).toBe(true);
  expect(await answered(page, `untick ${item}`)).toBe(`${item} is back on the list.`);
  expect((await read())[0].checked).toBe(false);
  expect(await answered(page, `do we have ${PREFIX} milk`)).toContain(`on the list: ${item}`);
});

test("a bill is added, found as due, marked paid outside Kin, and reported paid", async ({ page }) => {
  const name = `${PREFIX} water`;
  const added = await answered(page, `add ${name} bill 123 due tomorrow`);
  expect(added).toMatch(/^Added .*₱123 due /);
  const r = await rest();
  const read = async () => (await (await r.ctx.get(`${r.url}/rest/v1/bills?select=name,amount,status&name=ilike.${encodeURIComponent(PREFIX)}*water`, { headers: r.headers })).json()) as { name: string; amount: string; status: string }[];
  const rows = await read();
  expect(rows).toHaveLength(1);
  expect(Number(rows[0].amount)).toBe(123);
  expect(rows[0].status).toBe("unpaid");
  const billName = rows[0].name;
  expect(await answered(page, `when is ${billName} due`)).toMatch(/is due .*tomorrow/);
  // No account named: the rules ask which, with "Paid outside Kin" as a chip.
  const asked = await ask(page, `paid ${billName}`);
  expect(asked.source).toBe("rules");
  expect(asked.choices ?? []).toContain("Paid outside Kin");
  expect(asked.pending).toBeTruthy();
  const paid = await ask(page, "Paid outside Kin", asked.pending);
  expect(paid.reply).toBe(`${billName} marked paid (₱123, outside Kin).`);
  expect(paid.actions).toEqual(["mark_bill_paid"]);
  expect((await read())[0].status).toBe("paid");
  expect(await answered(page, `is ${billName} paid`)).toMatch(/^Yes, .* is paid/);
});

test("a bill with no amount is asked for, and the answer finishes the add", async ({ page }) => {
  const asked = await ask(page, `add bill ${PREFIX} internet`);
  expect(asked.source).toBe("rules");
  expect(asked.reply).toMatch(/^How much is the .* bill, and when is it due\?$/);
  const done = await ask(page, "77 due the 28th", asked.pending);
  expect(done.reply).toMatch(/^Added .*₱77 due /);
  expect(done.actions).toEqual(["add_bill"]);
});

test("a chore nobody has is refused with where to look, not guessed", async ({ page }) => {
  const me = await myFirstName();
  const reply = await answered(page, `${me} did the ${PREFIX} dishes`);
  expect(reply).toMatch(/No chore called|done/);
});
