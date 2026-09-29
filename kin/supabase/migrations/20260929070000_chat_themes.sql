-- Chat themes (29 September, Janine's list): a thread's background and
-- bubble colour, chosen by anyone in it and the same for everyone in it.
--
-- Per thread rather than per person, as Messenger does it. A theme is
-- something a conversation has ("our chat is the ocean one"), and changing it
-- is a small shared act. Per person would also mean a second setting per
-- member per thread that nobody else can see, for a feature that exists to
-- be seen.
--
-- Keyed by the thread's realtime topic -- 'family-chat:<household id>' or
-- 'family-link:<link id>' -- because chat_topic_is_mine()
-- (20260926130000) already answers "is this caller in this thread" for
-- exactly those names. When the thread list adds more kinds of thread and
-- teaches that function their topics, themes work for them with no change
-- here.
--
-- The theme id is checked for shape only; the set of themes lives in the app
-- (src/lib/chat-themes.ts), which draws an id it doesn't know as no theme.

create table if not exists public.chat_themes (
  topic text primary key check (topic ~ '^[a-z-]{1,32}:[0-9a-f-]{36}$'),
  theme text not null check (theme ~ '^[a-z0-9-]{1,32}$'),
  set_by uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.chat_themes enable row level security;

drop policy if exists chat_themes_select on public.chat_themes;
create policy chat_themes_select on public.chat_themes
  for select to authenticated using ((select public.chat_topic_is_mine(topic)));

drop policy if exists chat_themes_insert on public.chat_themes;
create policy chat_themes_insert on public.chat_themes
  for insert to authenticated with check (
    (select public.chat_topic_is_mine(topic)) and set_by = (select public.current_member_id())
  );

drop policy if exists chat_themes_update on public.chat_themes;
create policy chat_themes_update on public.chat_themes
  for update to authenticated
  using ((select public.chat_topic_is_mine(topic)))
  with check ((select public.chat_topic_is_mine(topic)) and set_by = (select public.current_member_id()));

-- No delete: going back to the default is a row saying 'default', so the
-- thread still records who changed it last.

grant select, insert, update on public.chat_themes to authenticated;
