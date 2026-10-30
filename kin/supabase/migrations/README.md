# Migrations that run themselves

Put a new migration **here**, not in `kin/migrations/`.

    kin/supabase/migrations/YYYYMMDDHHMMSS_short_name.sql

The timestamp is the version, and it is how both databases know what they have
already run. Use UTC, and make it later than every file already here.

## What happens to it

1. You open a pull request with the file in it, like any other change.
2. It merges on green, like any other change.
3. **Dev applies it by itself**, the moment the merge lands — if `DEV_DB_URL`
   is set. Without it the run says loudly that dev was skipped.
4. **Production follows by itself**, in the same run, and only if dev took it.
   `automerge.yml` dispatches *Migrate* with target `both` after each merge.
   No SQL is pasted, and the run prints exactly which versions it applied.
   Actions → *Migrate* → Run workflow is still there for re-running a
   transient failure, or for `production` alone when the two have drifted.

Step 4 used to wait for Jonathan to press a button. On 21 September the button
was forgotten and a merged feature sat in the app unable to save, so
production now follows dev on its own (the header of
`.github/workflows/migrate.yml` tells the story). What changed on 10 September
is *how* a migration is run — a workflow instead of a copy-paste into the SQL
editor, and a recorded list of what actually went in. The SQL editor, a
connection string and the connector are still never the route; see the
`migrations` skill.

## Writing one

Say what it does and why at the top, the way the older files do. The comment is
the only thing anybody reads later.

**No `begin;` or `commit;` of your own.** The runner already wraps each
migration in one transaction together with the row that records it, so either
the change and the record of it both land or neither does. A `begin;` inside
the file would close that transaction early with its `commit;`, and the ledger
row would be written outside it. `migrate.mjs` refuses a file that contains
one, and says so.

Keep it **idempotent** if you reasonably can (`add column if not exists`,
`create or replace`) — not because the pipeline runs things twice, it does not,
but because the version ledger is the only thing standing between "already
applied" and "applied again", and a migration that survives being run twice
never needs that to be perfect.

## What is already in the databases

`supabase_migrations.schema_migrations`, on each project, is the record. It is
not empty and it never was: production has carried a ledger since 1 September,
and the entries there predate this directory.

Everything applied before 10 September is **history, not input**. It lives in
`kin/migrations/` and is frozen — those files describe what was run by hand.
Never move one in here: the pipeline would see a version the ledger does not
have and try to run it again against a database that already has it.

## If it goes wrong

The runner (`kin/scripts/migrate.mjs`, not `supabase db push`; its header says
why) stops at the first failing migration, and the versions it already applied
stay applied — this is not one big transaction across files. The run
log names the file it died on. Fix forward with a new migration; do not edit a
file that has already run anywhere, because its version is already ticked off
in a ledger and the edit will simply never be applied.
