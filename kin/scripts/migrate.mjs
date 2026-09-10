#!/usr/bin/env node
/**
 * Apply the migrations in supabase/migrations that a database has not run yet.
 *
 * WHY THIS EXISTS RATHER THAN `supabase db push`
 * ----------------------------------------------
 * The CLI was the plan, and it does not fit -- for a fact about this
 * repository rather than a preference. `db push` compares the files in
 * supabase/migrations against supabase_migrations.schema_migrations on the
 * remote, and refuses when the remote holds versions it cannot find a file
 * for. Both databases are exactly that case, and differently:
 *
 *   production  57 ledger entries, from 1 September onward
 *   dev         11, all written on 10 September when its schema was built
 *
 * They are different sets, so no single set of local files satisfies both, and
 * the two ways out are worse than this file. Importing 57 historical
 * migrations as local files would have the pipeline try to re-run them against
 * a database that already has them. `migration repair --status reverted` would
 * quietly rewrite the record of what actually ran, which is the one thing the
 * ledger is for.
 *
 * So: same ledger table, same version numbers, same ordering rule, a hundred
 * lines we can read. If the two ledgers ever converge, this becomes a thin
 * wrapper around the CLI and can be deleted.
 *
 * It drives `psql`, which is on every GitHub runner already, rather than
 * importing a Postgres client -- so this adds no dependency to the app, needs
 * no install step before it can run, and reports a failure the way psql does:
 * with the statement and the line it died on.
 *
 * WHAT IT GUARANTEES
 * ------------------
 * Each migration runs inside one transaction with its own ledger row. Either
 * the change and the record of it both land, or neither does -- there is no
 * state where a migration ran and nothing knows. Migrations run in version
 * order, oldest first, and stop at the first failure: a later one never
 * applies over the wreckage of an earlier one.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not roll back. Postgres cannot undo a committed DDL statement
 * because a later file failed, and pretending otherwise by wrapping every file
 * in one transaction would mean a single failure leaves an all-or-nothing
 * puzzle in a live database. Fix forward, with a new migration.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");

const DRY = process.argv.includes("--dry-run");
const url = process.env.MIGRATE_DB_URL;
const label = process.env.MIGRATE_LABEL ?? "database";

if (!url) {
  console.error("migrate: MIGRATE_DB_URL is not set. Nothing to connect to, so nothing was done.");
  process.exit(2);
}

/** `20260910101500_asset_liability_last_updated.sql` -> version and name. */
function localMigrations() {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((file) => {
      const m = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
      if (!m) {
        console.error(
          `migrate: ${file} is not a migration name. Use YYYYMMDDHHMMSS_lower_snake_case.sql —\n` +
            `         the timestamp is the version, and it is the only thing that decides order.`,
        );
        process.exit(2);
      }
      return { version: m[1], name: m[2], file, sql: fs.readFileSync(path.join(dir, file), "utf8") };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
}

/** The runner opens the transaction, so a file must not open its own.
 *
 * A `begin;` inside one is not merely redundant: its matching `commit;` would
 * close the runner's transaction early, and the ledger row written afterwards
 * would land outside it. The migration would then be recorded by a statement
 * that could still fail on its own. Refusing is cheaper than explaining that
 * afterwards. */
function refuseIfItManagesItsOwnTransaction(m) {
  const bare = m.sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const found = /^\s*(begin|commit|rollback)\s*;/im.exec(bare);
  if (found) {
    console.error(
      `migrate: ${m.file} contains its own \`${found[1].toLowerCase()};\`.\n` +
        `         Every migration is already wrapped in one transaction with its ledger row.\n` +
        `         Remove the begin/commit and let the runner own it.`,
    );
    process.exit(2);
  }
}

/** Run SQL through psql. Returns stdout; exits the process on failure after
 * printing what psql said, which is more useful than anything we could
 * paraphrase. */
function psql(sql, { quiet = false } = {}) {
  const res = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-f", "-"], {
    input: sql,
    encoding: "utf8",
  });
  if (res.error && res.error.code === "ENOENT") {
    console.error("migrate: psql is not installed. It ships with the postgresql-client package and is preinstalled on GitHub runners.");
    process.exit(2);
  }
  if (res.status !== 0) {
    if (!quiet) process.stderr.write(res.stderr ?? "");
    return { failed: true, stderr: res.stderr ?? "", stdout: res.stdout ?? "" };
  }
  return { failed: false, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function main() {
  const local = localMigrations();
  for (const m of local) refuseIfItManagesItsOwnTransaction(m);

  // Present on both databases already; created here so a brand-new one -- the
  // next dev project, a reviewer's own -- works with no manual first step.
  const setup = psql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text,
      statements text[]
    );
  `);
  if (setup.failed) {
    console.error(`${label}: could not reach the database, or could not read its migration ledger. Nothing was applied.`);
    process.exit(2);
  }

  const read = psql("select version from supabase_migrations.schema_migrations order by version;");
  if (read.failed) {
    console.error(`${label}: could not read the migration ledger. Nothing was applied.`);
    process.exit(2);
  }
  const applied = new Set(read.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
  const pending = local.filter((m) => !applied.has(m.version));

  console.log(`${label}: ${local.length} migration file(s) here, ${applied.size} already recorded, ${pending.length} pending.`);

  // A file older than something already applied is a merge that went in behind
  // the pipeline's back. Applying it now would run it out of order against a
  // schema that has already moved past it.
  const newest = [...applied].sort().pop() ?? "";
  const late = pending.filter((m) => m.version < newest);
  if (late.length > 0) {
    console.error(
      `${label}: ${late.length} pending migration(s) are older than ${newest}, which has already run:\n` +
        late.map((m) => `    ${m.file}`).join("\n") +
        `\n         Rename them with a timestamp later than that, so they run in the order they were written in.`,
    );
    process.exit(1);
  }

  if (pending.length === 0) {
    console.log(`${label}: nothing to do — it already has everything in this directory.`);
    return;
  }

  for (const m of pending) console.log(`${label}: pending — ${m.file}`);
  if (DRY) {
    console.log(`${label}: --dry-run, so nothing was applied.`);
    return;
  }

  for (const m of pending) {
    console.log(`\n${label}: applying ${m.file}`);
    // One transaction around the migration and the row that records it. The
    // version and name are matched against a strict pattern above, so they are
    // safe to inline here.
    const res = psql(
      `begin;\n${m.sql}\ninsert into supabase_migrations.schema_migrations (version, name) ` +
        `values ('${m.version}', '${m.name}');\ncommit;\n`,
    );
    if (res.failed) {
      console.error(`\n${label}: ${m.file} FAILED. Nothing from it was kept, and nothing after it was tried.`);
      console.error(
        `\n${label}: any earlier migration in this run is applied and recorded, which is deliberate —` +
          `\n         fix this one forward in a new migration rather than editing a file that has already run.`,
      );
      process.exit(1);
    }
    console.log(`${label}: applied and recorded ${m.version}`);
  }

  console.log(`\n${label}: ${pending.length} migration(s) applied.`);
}

main();
