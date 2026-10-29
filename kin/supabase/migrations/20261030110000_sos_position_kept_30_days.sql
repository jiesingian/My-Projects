-- An SOS alert's position is kept for 30 days (Jonathan, 29 October: legal
-- readiness, "Position cleared after 30 days").
--
-- sos_alerts (20260930100000) keeps the exact place of every press for as
-- long as the household exists: a lasting history of where a person was,
-- when shared location keeps only the latest point. The position matters
-- while the household responds; after 30 days a nightly job blanks lat, lng
-- and accuracy. The alert itself (who, when, who responded) stays in the
-- SOS history. The table's own check allows all three null together.
--
-- Same shape as sweep_app_errors (20261021010000): a definer function for the
-- job only, scheduled with pg_cron where it exists (PGlite has none).
--
-- No begin/commit: migrate.mjs wraps this file and its ledger row in one
-- transaction.

create or replace function public.clear_old_sos_positions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with cleared as (
    update public.sos_alerts
       set lat = null, lng = null, accuracy_m = null
     where created_at < now() - interval '30 days'
       and (lat is not null or lng is not null or accuracy_m is not null)
    returning 1
  )
  select count(*)::integer from cleared;
$$;

revoke all on function public.clear_old_sos_positions() from public, anon, authenticated;

-- Once now, for the alerts already older than that.
select public.clear_old_sos_positions();

do $$
begin
  if to_regnamespace('cron') is not null then
    begin
      execute $c$ select cron.unschedule('kin-sos-positions') $c$;
    exception when others then
      null;
    end;
    execute $c$ select cron.schedule('kin-sos-positions', '41 18 * * *', 'select public.clear_old_sos_positions()') $c$;
  end if;
end
$$;
