-- Import a statement (the 14 October "What's Left" review, item 3)
-- ================================================================
--
-- A CSV of transaction history from BPI, BDO, UnionBank or GCash, read in
-- the browser, mapped to date / description / amount, reviewed, and saved
-- into one account. The file itself never reaches the server: what arrives
-- here is the rows the person ticked on the review screen, as JSON, and
-- nothing of the file is kept.
--
-- WHY A FUNCTION
--
-- Duplicates are skipped: a row is already in the account when the account
-- has a movement on the same household day, in the same direction, for the
-- same amount, with the same description (case and spacing aside). Doing
-- that check and the inserts in one statement means two imports of the same
-- file at once cannot both get in, and a half-imported statement cannot
-- happen.
--
-- The match COUNTS: a statement with two identical ₱50 jeepney top-ups on
-- one day, against an account that has one of them already, imports the
-- second. Only rows that were in the account before this import began are
-- matched, so the file's own repeats are never collapsed into one.
--
-- WHO CAN
--
-- security invoker: everything below runs as the caller, through the same
-- policies as adding a movement by hand -- the account must be one they can
-- see, in their household -- plus the rule the app already keeps for
-- writing: a joint account is the grown-ups', a personal one its owner's.
-- An archived account takes nothing. Wealth is Kin Plus, and the
-- require_kin_plus trigger on wealth_transactions refuses a Free household.

create or replace function public.import_wealth_transactions(p_account uuid, p_rows jsonb)
returns table (imported integer, skipped integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_family uuid := public.current_family_id();
  v_me uuid := public.current_member_id();
  v_tz text;
  a public.accounts%rowtype;
  r jsonb;
  v_date date;
  v_dir text;
  v_amount numeric;
  v_text text;
  v_key text;
  v_existing integer;
  v_used jsonb := '{}'::jsonb;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  if v_family is null or v_me is null then
    raise exception 'not signed in to a household' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'statement_too_long: import up to 2000 rows at a time' using errcode = 'P0001';
  end if;

  select * into a from public.accounts where id = p_account and family_id = v_family;
  if not found or a.is_archived then
    raise exception 'statement_account: that account is not one you can import into' using errcode = '42501';
  end if;
  if not ((a.is_joint and public.current_member_role() in ('parent', 'adult')) or (not a.is_joint and a.owner_member_id = v_me)) then
    raise exception 'statement_account: that account is not one you can import into' using errcode = '42501';
  end if;

  select coalesce(f.time_zone, 'Asia/Manila') into v_tz from public.families f where f.id = v_family;
  v_tz := coalesce(v_tz, 'Asia/Manila');

  -- One import at a time per account.
  perform pg_advisory_xact_lock(hashtext('statement:' || p_account::text));

  for r in select * from jsonb_array_elements(p_rows) loop
    v_date := (r ->> 'date')::date;
    v_dir := r ->> 'direction';
    v_amount := round((r ->> 'amount')::numeric, 2);
    v_text := left(regexp_replace(btrim(coalesce(r ->> 'particulars', '')), '\s+', ' ', 'g'), 150);
    if v_dir not in ('in', 'out') or not (v_amount > 0) or v_text = '' then
      raise exception 'statement_row: each row needs a date, money in or out, an amount and a description' using errcode = '22023';
    end if;

    v_key := v_date::text || '|' || v_dir || '|' || v_amount::text || '|' || lower(v_text);
    select count(*) into v_existing
      from public.wealth_transactions t
      where t.account_id = p_account
        and t.created_at < now()
        and (t.occurred_at at time zone v_tz)::date = v_date
        and t.direction = v_dir
        and round(t.amount, 2) = v_amount
        and lower(regexp_replace(btrim(t.particulars), '\s+', ' ', 'g')) = lower(v_text);

    if coalesce((v_used ->> v_key)::int, 0) < v_existing then
      v_used := jsonb_set(v_used, array[v_key], to_jsonb(coalesce((v_used ->> v_key)::int, 0) + 1));
      v_skipped := v_skipped + 1;
    else
      insert into public.wealth_transactions (family_id, account_id, direction, amount, particulars, category, occurred_at, status, recorded_by)
      values (v_family, p_account, v_dir, v_amount, v_text, nullif(btrim(r ->> 'category'), ''),
              (v_date::timestamp + time '12:00') at time zone v_tz, 'confirmed', v_me);
      v_imported := v_imported + 1;
    end if;
  end loop;

  return query select v_imported, v_skipped;
end;
$$;

revoke execute on function public.import_wealth_transactions(uuid, jsonb) from public, anon;
grant execute on function public.import_wealth_transactions(uuid, jsonb) to authenticated;
