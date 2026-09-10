# Frozen. Nothing here runs.

These thirteen files are the migrations that were applied **by hand**, in the
Supabase SQL editor, between 7 and 10 September. They are kept because they are
the only written explanation of why the schema looks the way it does — several
of them are worth reading, particularly
`2026-09-08-goal-totals-from-the-ledger.sql`.

**New migrations do not go here.** They go in `kin/supabase/migrations/`, where
the pipeline picks them up: dev applies them on merge, production applies them
when Jonathan presses the button. See the README there.

**Never move one of these files into that directory.** Its version would be
missing from the ledgers, so the pipeline would try to run it again against two
databases that already have it.

## Why the "NOT YET APPLIED" headers are not to be trusted

Every file here opens with a comment saying whether it had been run. That
comment was maintained by whoever remembered to come back and change it, and
twice nobody did:

- `2026-09-08-goal-totals-from-the-ledger.sql` still said NOT YET APPLIED after
  it had been applied. #50 corrected it.
- Three migrations on 9 September were merged and never run at all. The app
  broke in front of a person: saving Settings failed with *"Could not find the
  'country' column of 'families'"*.

`supabase_migrations.schema_migrations`, on each database, is now the answer to
"has this run" — a row written in the same transaction as the migration itself,
rather than a sentence somebody has to remember to edit.
