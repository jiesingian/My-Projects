-- Files attached to a task/routine itself -- reference instructions, a form,
-- a recipe card -- not to any one completed occurrence. Mirrors doc_files'
-- shape (storage_path + name + mime + size), but flat like routines itself:
-- routines carries no visibility tiers, so neither does this.
create table if not exists routine_attachments (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists routine_attachments_routine_id_idx on routine_attachments(routine_id);
create index if not exists routine_attachments_family_id_idx on routine_attachments(family_id);

alter table routine_attachments enable row level security;

drop policy if exists routine_attachments_select on routine_attachments;
create policy routine_attachments_select on routine_attachments
  for select using (family_id = current_family_id());

drop policy if exists routine_attachments_insert on routine_attachments;
create policy routine_attachments_insert on routine_attachments
  for insert with check (family_id = current_family_id());

drop policy if exists routine_attachments_delete on routine_attachments;
create policy routine_attachments_delete on routine_attachments
  for delete using (family_id = current_family_id());
