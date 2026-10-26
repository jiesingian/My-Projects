-- English everywhere a person reads (Jonathan, 26 October: Kin is an
-- international app; every default piece of text is English, feature names
-- included). The TypeScript copy changes in the same pull request; these are
-- the three pieces the database writes itself. Keys, columns and kinds keep
-- their names: only words a person sees change. Re-runnable.

-- 1. The push three days before 1 November (push_words_undas, used by
--    due_remembrance_pushes since 20261020210000): "All Saints' Day is on
--    Saturday", the body as it was.
create or replace function public.push_words_undas(p_today date, p_names text[], p_total bigint)
returns table (title text, body text, url text)
language sql
immutable
set search_path = ''
as $$
  select 'All Saints'' Day is on ' || to_char(make_date(extract(year from p_today)::int, 11, 1), 'FMDay'),
         'Remembering ' || array_to_string(p_names, ', ')
           || case when p_total > 3 then ' and ' || (p_total - 3) || ' more' else '' end
           || '. Time to plan the visit: candles and flowers.',
         '/today';
$$;

-- 2. The note on each week's allowance the piggy bank writes
--    (alkansya_pay_allowances, 20261019100000): "Weekly allowance". The body
--    of the function is otherwise the one that ran on main.
create or replace function public.alkansya_pay_allowances()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid := public.current_family_id();
  v_today date;
  v_paid integer := 0;
  p public.alkansya_plans%rowtype;
  d date;
  v_ipon numeric;
  v_bigay numeric;
begin
  if v_family is null then
    return 0;
  end if;
  v_today := public.alkansya_household_today(v_family);
  for p in
    select * from public.alkansya_plans
    where family_id = v_family and active and coalesce(paid_through, v_today) < v_today
    for update
  loop
    if p.weekly_amount > 0 then
      for d in
        select gs::date from generate_series(greatest(p.paid_through + 1, v_today - 84), v_today, interval '1 day') gs
        where extract(dow from gs)::int = p.pay_weekday
      loop
        v_ipon := round(p.weekly_amount * p.ipon_pct / 100.0, 2);
        v_bigay := round(p.weekly_amount * p.bigay_pct / 100.0, 2);
        insert into public.alkansya_entries (family_id, member_id, jar, kind, amount, occurred_on, note)
        select v_family, p.member_id, j.jar, 'allowance', j.amount, d, 'Weekly allowance'
        from (values ('gastos', p.weekly_amount - v_ipon - v_bigay), ('ipon', v_ipon), ('bigay', v_bigay)) as j(jar, amount)
        where j.amount > 0;
        v_paid := v_paid + 1;
      end loop;
    end if;
    -- The plans trigger keeps paid_through unless this flag says it is us.
    perform set_config('kin.alkansya_paying', 'on', true);
    update public.alkansya_plans set paid_through = v_today where member_id = p.member_id;
    perform set_config('kin.alkansya_paying', 'off', true);
  end loop;
  return v_paid;
end;
$$;

revoke execute on function public.alkansya_pay_allowances() from public, anon;
grant execute on function public.alkansya_pay_allowances() to authenticated;

-- 3. A new gift draw's title (gift_draws.title, 20261019233200): "Gift
--    exchange". Draws already named keep their names.
alter table public.gift_draws alter column title set default 'Gift exchange';
