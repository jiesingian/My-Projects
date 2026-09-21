-- A short comment on why a task was marked done or skipped -- the Today
-- tab's completion note, editable after the fact without touching the tick
-- itself.
alter table routine_log add column if not exists note text;
