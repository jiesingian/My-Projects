#!/usr/bin/env node
/**
 * Does the schema the code believes in actually exist?
 *
 * On 9 September three migrations were merged and not run, and the app broke
 * in front of a person: saving Settings failed with "Could not find the
 * 'country' column of 'families'", and adding an account failed the same way
 * on 'app_store_url'. Nothing caught it. `tsc`, lint and build were all green,
 * because they check the code against `database.types.ts` — and that file said
 * the columns existed. It is the database that disagreed, and nothing was
 * asking it.
 *
 * This asks it. `tsc` already forces every action to match
 * `database.types.ts`, so checking that file against the live schema closes
 * the loop from the code all the way to Postgres.
 *
 * HOW
 * ---
 * For each table in the generated types, take its `Row` columns and ask
 * PostgREST to parse a select of all of them with `limit=0`. Nothing is read
 * and nothing is written; only the parse has to succeed. PostgREST answers
 *
 *   400 / 42703    column <table>.<name> does not exist
 *   404 / PGRST205 Could not find the table 'public.<name>' in the schema cache
 *
 * which names the problem exactly. Nothing is read, so it reads nobody's data
 * — but it does need to be signed in, which is less obvious than it looks and
 * was got wrong on 10 September. Reaching a table through PostgREST means
 * evaluating its row-level-security policy even when no row comes back, every
 * policy here calls `current_family_id()`, and `anon` may not execute that
 * function. An anonymous probe is refused on all 62 tables with 42501, which
 * reads exactly like the four tables that are deliberately unreadable.
 *
 * WHICH DATABASES
 * ---------------
 * Both. Dev (NEXT_PUBLIC_SUPABASE_*) is where the suite runs. Production
 * (PROD_*) is where the family's records live and where a migration is applied
 * by hand — which makes it the target where "merged but never run" actually
 * happens, and so the one this must not stop watching. When the app was split
 * across two projects on 10 September this check followed the suite to dev and
 * quietly stopped looking at production, which would have left the original
 * failure completely uncovered.
 *
 * WHAT IT DOES NOT CATCH
 * ----------------------
 * A column that exists but has the wrong type, and a constraint or policy that
 * is missing. It answers "is it there", not "is it right". The
 * income_schedules cascade bug found the same day would have walked straight
 * past this; `delete-household.spec.ts` is what catches that one.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const typesFile = path.join(here, "..", "src", "lib", "database.types.ts");

/** Every table in the generated types, with the columns its `Row` declares. */
function tablesFromTypes(source) {
  const lines = source.split("\n");
  const tables = new Map();
  let table = null;
  let inRow = false;
  let depth = 0;

  for (const line of lines) {
    if (!table) {
      // `      families: {` — a table at the Tables level, six spaces in.
      const m = /^ {6}(\w+): \{$/.exec(line);
      if (m) { table = m[1]; inRow = false; }
      continue;
    }
    if (!inRow) {
      if (/^ {8}Row: \{$/.test(line)) { inRow = true; depth = 1; tables.set(table, []); }
      else if (/^ {6}\}/.test(line)) table = null;
      continue;
    }
    // Inside Row. Track nesting so a nested object literal cannot be mistaken
    // for a column, and stop at the matching close.
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (depth === 1) {
      const col = /^ {10}(\w+)(\??): /.exec(line);
      if (col) tables.get(table).push(col[1]);
    }
    depth += opens - closes;
    if (depth <= 0) { inRow = false; table = null; }
  }
  return tables;
}

/** Codes that mean "this credential may not read that table", which is a grant
 * and not a shape. Four tables have RLS on and no policies at all --
 * access_codes, access_events, calendar_tokens, drive_tokens -- and that is
 * deliberate: nothing but the service role is meant to read them. */
const NOT_A_SCHEMA_PROBLEM = new Set(["42501"]);

/** Codes that mean the check could not be performed at all, as opposed to the
 * schema being wrong. Reporting one of these as a disagreement produces a
 * confidently wrong diagnosis, which is how a check earns being ignored.
 *
 * PGRST301/302/303 are all auth: expired, missing or -- as happened on
 * 10 September -- "JWT issued at future", which is clock skew between the auth
 * server and PostgREST and has nothing whatever to do with a column. That run
 * told a reader the database was missing something and pointed them at
 * kin/migrations. It was not, and they would have found nothing there. */
const CANNOT_CHECK = new Set(["PGRST301", "PGRST302", "PGRST303", "401", "403", "500", "502", "503", "504"]);

/** How many times a probe is worth repeating before its answer counts.
 *
 * PGRST303 "JWT issued at future" is clock skew between the auth server that
 * minted the token and the PostgREST instance reading it, and it is per
 * request rather than per run. Measured on 10 September against production:
 * exactly one probe of 62 -- assets -- was refused, while every other table
 * answered normally on the same token seconds either side of it. That one
 * refusal failed the whole check.
 *
 * A check that goes red for a reason nobody can act on is a check people learn
 * to scroll past, and this is the one file in the repository that cannot
 * afford that -- it exists because three migrations were merged and never run
 * and every green tick agreed with them.
 *
 * Only "could not ask" is retried. A missing column will not have appeared by
 * the second look, and retrying it would just make an honest failure slower.
 */
const ATTEMPTS = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ask one table once, and again if the answer was "could not ask". */
async function probe(url, table, cols, headers) {
  let last = { code: "network", message: "no attempt was made" };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(`${url}/rest/v1/${table}?select=${cols.join(",")}&limit=0`, { headers });
    } catch (e) {
      last = { code: "network", message: String(e.message ?? e) };
      if (attempt < ATTEMPTS) await sleep(1000 * attempt);
      continue;
    }
    if (res.ok) return { ok: true, attempt };
    let body;
    try { body = JSON.parse(await res.text()); } catch { body = { message: `HTTP ${res.status}` }; }
    last = { code: body.code ?? String(res.status), message: body.message ?? "" };
    // A schema answer, right or wrong, is an answer. Only auth and transport
    // failures are worth asking about a second time.
    if (!CANNOT_CHECK.has(last.code)) return { ...last, attempt };
    if (attempt < ATTEMPTS) await sleep(1000 * attempt);
  }
  return { ...last, attempt: ATTEMPTS };
}

/** Ask one database whether it has what the code believes in.
 *
 * It signs in first, and that is not incidental. The probe is
 * `?select=<every column>&limit=0`, which reads no row -- so it looks as
 * though row-level security should be irrelevant and an anonymous caller
 * would do. It will not: reaching a table through PostgREST means evaluating
 * its policy, every policy here calls `current_family_id()`, and `anon` may
 * not execute that function. An anonymous probe gets
 *
 *   401 / 42501 permission denied for function current_family_id
 *
 * for all 62 tables -- which this script would otherwise file under "RLS on,
 * no policies, by design" and then report a green tick having checked nothing.
 * That very nearly shipped on 10 September; the guard against it is that zero
 * tables checked is now a failure, below.
 */
async function checkOne(label, url, key, email, password, tables) {
  let headers = { apikey: key };
  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).catch((e) => ({ ok: false, status: String(e.message ?? e) }));
  if (!auth.ok) {
    console.error(`\n${label}: could NOT sign in (${auth.status}) — nothing was checked against ${new URL(url).host}.`);
    return "unchecked";
  }
  headers = { apikey: key, Authorization: `Bearer ${(await auth.json()).access_token}` };
  const problems = [];
  const unreachable = [];
  const unchecked = [];
  const retried = [];
  let columns = 0;
  let checked = 0;

  await Promise.all(
    [...tables].map(async ([table, cols]) => {
      if (cols.length === 0) return;
      const r = await probe(url, table, cols, headers);
      if (r.ok) {
        checked += 1;
        columns += cols.length;
        if (r.attempt > 1) retried.push(`${table} (answered on attempt ${r.attempt})`);
        return;
      }
      if (NOT_A_SCHEMA_PROBLEM.has(r.code)) { unreachable.push(table); return; }
      if (CANNOT_CHECK.has(r.code)) { unchecked.push({ table, code: r.code, message: r.message }); return; }
      problems.push({ table, code: r.code, message: r.message });
    }),
  );

  console.log(`\n${label}: ${checked} tables, ${columns} columns, checked against ${new URL(url).host}`);
  // Said out loud rather than swallowed: a retry that saved a run is the only
  // evidence that the skew is still there, and it is worth knowing if it
  // starts needing all three attempts.
  if (retried.length > 0) {
    console.log(`${label}: ${retried.length} needed a retry (auth or transport, not schema): ${retried.sort().join(", ")}`);
  }
  if (unreachable.length > 0) {
    console.log(
      `${label}: ${unreachable.length} not checked, because this credential may not read them at all ` +
        `(RLS on, no policies, by design): ${unreachable.sort().join(", ")}`,
    );
  }

  // Could not ask is its own outcome, and it fails. A schema check that passes
  // because it could not reach the database is a green tick that means nothing.
  if (unchecked.length > 0) {
    console.error(`${label}: could NOT check ${unchecked.length} table(s) — this is not a schema disagreement:`);
    for (const u of unchecked.slice(0, 5)) console.error(`    ${u.table}: ${u.code} ${u.message}`);
    if (unchecked.length > 5) console.error(`    …and ${unchecked.length - 5} more, same shape.`);
    console.error(`${label}: an auth or transport failure. Nothing here says the schema is wrong.`);
    return "unchecked";
  }

  // Zero checked is never success. This is the guard for the failure that
  // nearly shipped: an anonymous probe was refused on all 62 tables, every
  // refusal was filed as "by design", and the run then announced that the
  // database had everything the code believes in -- having verified nothing.
  if (checked === 0) {
    console.error(`${label}: checked ZERO tables. That is not a pass — something refused every probe.`);
    return "unchecked";
  }

  if (problems.length === 0) {
    console.log(`${label}: the database has everything the code believes in.`);
    return "ok";
  }

  console.error(`\n${label}: ${problems.length} table(s) the code and the database disagree about:\n`);
  for (const p of problems.sort((a, b) => a.table.localeCompare(b.table))) {
    console.error(`  ${p.table}`);
    console.error(`    ${p.code}: ${p.message}`);
  }
  console.error(
    `\nThis is almost always a migration that has not been run against ${label.trim()}.` +
      "\nkin/supabase/migrations/ holds them; the one at fault will say what it adds." +
      "\nDev applies them on merge. Production waits for Jonathan: Actions → Migrate →" +
      "\nRun workflow → production. (kin/migrations/ is frozen history — not that.)",
  );
  return "mismatch";
}

async function main() {
  const tables = tablesFromTypes(fs.readFileSync(typesFile, "utf8"));
  if (tables.size === 0) {
    console.error("check-schema: parsed no tables out of database.types.ts — the generator's shape has changed and this script needs updating.");
    process.exit(2);
  }

  // Every database the code is expected to run against. Dev is where the suite
  // runs; production is where the family's records live and where a migration
  // is applied by hand -- which makes it the one where "merged but never run"
  // actually happens, and so the one this must not stop watching.
  const targets = [
    {
      label: "dev ", required: true,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD,
    },
    {
      label: "prod", required: false,
      url: process.env.PROD_SUPABASE_URL, key: process.env.PROD_SUPABASE_ANON_KEY,
      email: process.env.PROD_E2E_EMAIL, password: process.env.PROD_E2E_PASSWORD,
    },
  ];

  const complete = (t) => !!(t.url && t.key && t.email && t.password);
  if (!complete(targets[0])) {
    console.error("check-schema: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, E2E_EMAIL and E2E_PASSWORD are all required.");
    process.exit(2);
  }

  const configured = targets.filter(complete);
  const skipped = targets.filter((t) => !t.required && !complete(t));
  const results = [];
  for (const t of configured) results.push(await checkOne(t.label, t.url, t.key, t.email, t.password, tables));

  console.log("");
  for (const s of skipped) {
    console.log(
      `check-schema: ${s.label.trim()} was NOT checked — PROD_SUPABASE_URL, PROD_SUPABASE_ANON_KEY, ` +
        `PROD_E2E_EMAIL and PROD_E2E_PASSWORD are not all set. ` +
        `Production is where migrations are run by hand, so this is the target that most needs watching.`,
    );
  }
  if (results.includes("mismatch")) process.exit(1);
  if (results.includes("unchecked")) process.exit(2);
  console.log(`check-schema: ${configured.length} database(s) checked, all consistent with the code.`);
}

await main();
