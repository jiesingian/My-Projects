#!/usr/bin/env node
// No new table without a row-level security probe.
//
// Reads every migration in supabase/migrations and finds what each one
// creates: tables, views, and functions declared `security definer` (the
// ones that run as the database owner, so a hole in them is a hole in every
// household's wall). For each object it asks whether any probe under
// supabase/tests/pglite/probes/ mentions it by name. Two visibility bugs in
// the 19-20 October stabilisation pass (#728: a monito-monita organizer could
// open every pick early; #730: a child could read a parents-only medicine's
// prescription file) were tables that shipped with policies nobody had
// probed. This is the gate for that.
//
// What fails, what warns (CLAUDE.md: a new gate fails only on new debt):
//   - an object created by a migration that is NEW ON THIS BRANCH (not in the
//     base branch's tree) and mentioned by no probe        -> error, exit 1
//   - an object created by a migration already on the base branch, mentioned
//     by no probe and not in the allowlist                  -> warning only
//   - an allowlist entry that a probe now covers            -> notice (remove it)
//   - a new migration that creates something but is not in run.mjs's
//     MIGRATIONS list, so no probe can actually reach it    -> warning
//
// The allowlist, supabase/tests/pglite/no-probe-yet.txt, grandfathers what
// existed on 20 October 2026 so the step passes on main. It is debt, not
// permission: the aim is for it to shrink. `node scripts/check-rls-probes.mjs
// --update-allowlist` rewrites it from the current state; do that only when
// adding a grandfathered object on purpose, and say why in the PR.
//
// Usage (from kin/):
//   node scripts/check-rls-probes.mjs                  # main / local: warn only
//   node scripts/check-rls-probes.mjs --base origin/main   # a PR: fail on new debt
//   node scripts/check-rls-probes.mjs --update-allowlist
//
// `--base` compares file names against that ref's tree, not history, so a
// one-commit checkout plus `git fetch --depth=1 origin main` is enough. A
// renamed migration counts as new, as schema-check.yml treats it.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const here = process.cwd();
const migrationsDir = path.join(here, "supabase", "migrations");
const pgliteDir = path.join(here, "supabase", "tests", "pglite");
const probesDir = path.join(pgliteDir, "probes");
const allowlistPath = path.join(pgliteDir, "no-probe-yet.txt");

const args = process.argv.slice(2);
const baseRef = args.includes("--base") ? args[args.indexOf("--base") + 1] : null;
const updateAllowlist = args.includes("--update-allowlist");

// ── What each migration creates ─────────────────────────────────────────────

const bare = (name) => name.replace(/"/g, "").replace(/^public\./i, "").toLowerCase();

/** From `start`, the end of the SQL statement that begins there: past any
 * dollar-quoted body (a function's), up to the next `;`. */
function statementEnd(sql, start) {
  const semicolon = sql.indexOf(";", start);
  const dollar = /\$[A-Za-z_]*\$/g;
  dollar.lastIndex = start;
  const open = dollar.exec(sql);
  if (!open || (semicolon !== -1 && open.index > semicolon)) return semicolon === -1 ? sql.length : semicolon;
  const close = sql.indexOf(open[0], open.index + open[0].length);
  if (close === -1) return sql.length;
  const end = sql.indexOf(";", close + open[0].length);
  return end === -1 ? sql.length : end;
}

/** Tables, views and security-definer functions a migration file creates. */
function objectsIn(file) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8")
    // Comments can mention anything; only statements count.
    .replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Map();
  const add = (kind, name) => {
    const key = `${kind} ${bare(name)}`;
    if (!found.has(key)) found.set(key, { kind, name: bare(name), file });
  };
  for (const m of sql.matchAll(/\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?(?:\."?\w+"?)?)/gi)) add("table", m[1]);
  for (const m of sql.matchAll(/\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?(?:\."?\w+"?)?)/gi)) add("view", m[1]);
  for (const m of sql.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+("?[\w.]+"?(?:\."?\w+"?)?)\s*\(/gi)) {
    const statement = sql.slice(m.index, statementEnd(sql, m.index));
    if (/\bsecurity\s+definer\b/i.test(statement)) add("function", m[1]);
  }
  return [...found.values()];
}

// ── Which probes mention what ───────────────────────────────────────────────

const probeText = fs.readdirSync(probesDir).filter((f) => f.endsWith(".mjs"))
  .map((f) => fs.readFileSync(path.join(probesDir, f), "utf8")).join("\n").toLowerCase();
const probed = (name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(probeText);

const runMjs = fs.readFileSync(path.join(pgliteDir, "run.mjs"), "utf8");
const inHarness = (file) => runMjs.includes(`"${file}"`);

// ── The allowlist ───────────────────────────────────────────────────────────

function readAllowlist() {
  if (!fs.existsSync(allowlistPath)) return new Set();
  return new Set(
    fs.readFileSync(allowlistPath, "utf8").split("\n")
      .map((l) => l.replace(/#.*/, "").trim()).filter(Boolean)
      .map((l) => l.split(/\s+/).slice(0, 2).join(" ").toLowerCase()),
  );
}

// ── Which migrations are new on this branch ─────────────────────────────────

const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
let newOnBranch = new Set();
if (baseRef) {
  const onBase = execFileSync("git", ["ls-tree", "-r", "--name-only", "--full-tree", baseRef, "kin/supabase/migrations"], { encoding: "utf8" })
    .split("\n").filter(Boolean).map((p) => path.basename(p));
  const baseSet = new Set(onBase);
  newOnBranch = new Set(migrations.filter((f) => !baseSet.has(f)));
}

// ── Decide ──────────────────────────────────────────────────────────────────

// One entry per object, however many migrations redefine it (`create or
// replace function` on a definer helper is a change, not a new object): an
// object is new on this branch only when NO base-branch migration creates it.
const byKey = new Map();
for (const f of migrations) for (const o of objectsIn(f)) {
  const key = `${o.kind} ${o.name}`;
  if (!byKey.has(key)) byKey.set(key, { kind: o.kind, name: o.name, file: o.file, files: [] });
  byKey.get(key).files.push(o.file);
}
const all = [...byKey.values()];
const unprobed = all.filter((o) => !probed(o.name));
const isNew = (o) => baseRef && o.files.every((f) => newOnBranch.has(f));

if (updateAllowlist) {
  const lines = [
    "# Tables, views and security-definer functions that no PGlite probe mentions yet.",
    "# Grandfathered on 20 October 2026 so scripts/check-rls-probes.mjs passes on main;",
    "# each line is a probe still to write (negative cases first: another household,",
    "# a stranger, a child, a forged author). Remove a line when its probe lands.",
    "# A NEW migration gets no entry here without saying why in the pull request.",
    "#",
    "# kind      name                                   # first created by",
    ...unprobed.map((o) => `${o.kind.padEnd(9)} ${o.name.padEnd(38)} # ${o.file}`),
    "",
  ];
  fs.writeFileSync(allowlistPath, lines.join("\n"));
  console.log(`Wrote ${unprobed.length} entries to ${path.relative(here, allowlistPath)}.`);
  process.exit(0);
}

const allow = readAllowlist();
let errors = 0;
let warnings = 0;
const annotate = (level, o, text) => {
  const where = `supabase/migrations/${o.file}`;
  console.log(`::${level} file=kin/${where}::${text}`);
  console.log(`  ${level.toUpperCase()}  ${o.kind ? `${o.kind} ${o.name} ` : ""}(${where}): ${text}`);
};

console.log(`${migrations.length} migrations, ${all.length} tables/views/definer functions, ${unprobed.length} with no probe.`);
if (baseRef) console.log(`New on this branch (vs ${baseRef}): ${newOnBranch.size ? [...newOnBranch].join(", ") : "nothing"}.`);

for (const o of unprobed) {
  const key = `${o.kind} ${o.name}`;
  if (isNew(o)) {
    errors++;
    annotate("error", o, `${o.kind} ${o.name} is new and no probe under supabase/tests/pglite/probes/ mentions it. Add one (the migrations skill: negative cases included) and list the migration in run.mjs.`);
  } else if (!allow.has(key)) {
    warnings++;
    annotate("warning", o, `${o.kind} ${o.name} has no probe and is not in no-probe-yet.txt. Write a probe, or add it to the allowlist and say why.`);
  }
}
for (const file of newOnBranch) {
  if (all.some((o) => isNew(o) && o.files.includes(file)) && !inHarness(file)) {
    warnings++;
    annotate("warning", { file }, `${file} creates something but is not in MIGRATIONS in supabase/tests/pglite/run.mjs, so no probe can reach what it creates.`);
  }
}
for (const key of allow) {
  if (!unprobed.some((o) => `${o.kind} ${o.name}` === key)) {
    if (all.some((o) => `${o.kind} ${o.name}` === key)) console.log(`::notice::${key} is in no-probe-yet.txt but a probe now mentions it; the line can go.`);
    else console.log(`::notice::${key} is in no-probe-yet.txt but no migration creates it; the line can go.`);
  }
}

console.log(`\n${errors} error(s), ${warnings} warning(s).`);
process.exit(errors ? 1 : 0);
