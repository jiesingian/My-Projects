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
 * which names the problem exactly. Row-level security is irrelevant at
 * `limit=0` — this is a question about the shape of the schema, not its
 * contents, so it needs no special access and reads nobody's data.
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

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!url || !key || !email || !password) {
    // Loud, and a failure. A schema check that quietly passes because it could
    // not reach the database is worse than no schema check: it is a green tick
    // that means nothing.
    console.error("check-schema: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, E2E_EMAIL and E2E_PASSWORD are all required.");
    process.exit(2);
  }

  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!auth.ok) {
    console.error(`check-schema: could not sign in as the QA account (${auth.status}).`);
    process.exit(2);
  }
  const headers = { apikey: key, Authorization: `Bearer ${(await auth.json()).access_token}` };

  const tables = tablesFromTypes(fs.readFileSync(typesFile, "utf8"));
  if (tables.size === 0) {
    console.error("check-schema: parsed no tables out of database.types.ts — the generator's shape has changed and this script needs updating.");
    process.exit(2);
  }

  const problems = [];
  const unreachable = [];
  let columns = 0;
  let checked = 0;
  await Promise.all(
    [...tables].map(async ([table, cols]) => {
      if (cols.length === 0) return;
      const res = await fetch(`${url}/rest/v1/${table}?select=${cols.join(",")}&limit=0`, { headers });
      if (res.ok) { checked += 1; columns += cols.length; return; }
      let body;
      try { body = JSON.parse(await res.text()); } catch { body = { message: `HTTP ${res.status}` }; }
      const code = body.code ?? String(res.status);
      // 42501 is "permission denied for table", which is a grant, not a shape.
      // Four tables here have RLS on and no policies at all -- access_codes,
      // access_events, calendar_tokens, drive_tokens -- and that is deliberate:
      // nothing but the service role is meant to read them. This credential
      // cannot see them to check them, which is worth saying out loud and is
      // not a disagreement about the schema.
      if (code === "42501") { unreachable.push(table); return; }
      problems.push({ table, code, message: body.message ?? "" });
    }),
  );

  console.log(`check-schema: ${checked} tables, ${columns} columns, checked against ${new URL(url).host}`);
  if (unreachable.length > 0) {
    console.log(
      `check-schema: ${unreachable.length} not checked, because this credential may not read them at all ` +
        `(RLS on, no policies, by design): ${unreachable.sort().join(", ")}`,
    );
  }
  if (problems.length === 0) {
    console.log("check-schema: the database has everything the code believes in.");
    return;
  }

  console.error(`\ncheck-schema: ${problems.length} table(s) the code and the database disagree about:\n`);
  for (const p of problems.sort((a, b) => a.table.localeCompare(b.table))) {
    console.error(`  ${p.table}`);
    console.error(`    ${p.code}: ${p.message}`);
  }
  console.error(
    "\nThis is almost always a migration that was written and merged but never run." +
      "\nkin/migrations holds them; the one at fault will say what it adds." +
      "\nRunning them is Jonathan's — see CLAUDE.md.",
  );
  process.exit(1);
}

await main();
