-- NOT YET APPLIED. Jonathan runs this; nothing here has been run against the
-- database. Read "How to run it" at the foot before you start.
--
-- Goal totals: two ways to lose money, one fix
-- ===========================================
--
-- What is wrong
-- -------------
-- goals.current_amount is a stored running total, and both places that move
-- it do a read-modify-write in JavaScript:
--
--     const { data: goal } = await supabase.from("goals")
--       .select("current_amount").eq("id", entry.goal_id).maybeSingle();
--     await supabase.from("goals")
--       .update({ current_amount: Number(goal.current_amount) + delta })
--       .eq("id", entry.goal_id);
--
-- (src/lib/actions/wealth.ts, applySettlement and deleteTransactionAction.)
--
-- The read and the write are two separate round trips with no lock between
-- them, so the value written is computed from a number that may already be
-- stale by the time it lands.
--
--   1. LOST UPDATE. Two people contribute at the same moment. Both read
--      50,000. One writes 55,000, the other writes 53,000. The second write
--      wins and the first contribution is gone from the total -- while its
--      wealth_transactions row survives, so the ledger and the goal now
--      disagree and nothing anywhere notices.
--
--   2. DOUBLE COUNT. This one is not a race at all, which makes it the more
--      likely of the two to have already happened. confirmTransactionAction
--      never checks whether the entry it is confirming is already confirmed:
--      it sets status = 'confirmed' (harmless, idempotent) and then calls
--      applySettlement, which adds the amount to the goal a second time. Two
--      clicks on Confirm, or one double-submit before the page revalidates,
--      credits the goal twice for one movement of money.
--
-- Why it matters
-- --------------
-- Nothing reconciles this. The goal total is what the family reads to decide
-- whether they can afford the thing they are saving for, and it can drift
-- from the money that actually moved without any error, any log line, or any
-- visible symptom. Money is the one part of the app where being quietly wrong
-- is worse than being loudly broken.
--
-- Measured, 8 September, across every goal in the database:
--
--   Emergency fund   stored 210,000   ledger 0   drift 210,000   THROWAWAY
--   Emergency Fund   stored 0         ledger 0   drift 0         Singian
--   42 x E2E-...     stored 0         ledger 0   drift 0         throwaway
--
-- So there is no drift in the real household, and no real money is stored in
-- current_amount at all today. The single drifting row is the hand-seeded QA
-- fixture in the testbed, which never had ledger rows behind it because it
-- was written directly. Nothing in src/ or e2e/ reads that number -- checked.
--
-- That is the whole reason to do this now rather than later: today the fix
-- changes no real figure. Once the household starts using goals in earnest it
-- becomes a migration that moves live balances, and a much harder thing to
-- offer you.
--
-- The fix
-- -------
-- Stop doing arithmetic on a number we read a moment ago, and recompute the
-- total from the ledger instead.
--
-- This is not an approximation of the current behaviour, it is the same
-- number by construction. createGoalAction never sets current_amount, so
-- every goal starts at 0, and the only two things that ever move it are
-- applySettlement (+amount) and deleteTransactionAction (-amount), each
-- driven by exactly one wealth_transactions row. Summing those rows therefore
-- reproduces the running total exactly -- and the CASE below is copied from
-- applySettlement's delta so the two cannot drift apart in meaning.
--
-- Three properties, each earning its place:
--
--   IDEMPOTENT. It writes a destination, not a distance. Running it twice,
--   or fifty times, lands on the same number. That is what kills the
--   double-count outright rather than guarding against it -- and it is this
--   morning's lesson from the realign migration, applied at the point where
--   it will keep paying.
--
--   SELF-HEALING. Any drift already in a row is corrected the next time
--   anything touches that goal, instead of persisting forever.
--
--   LOCKED. The `for update` is the part that closes the race. A second
--   caller blocks there until the first has committed, so the sum below it is
--   computed in a snapshot that already contains the other contribution. A
--   plain recompute without the lock would still be wrong under READ
--   COMMITTED, because the sub-select would run against a snapshot taken
--   before the other transaction committed.
--
-- SECURITY INVOKER, deliberately. This function needs no privilege the caller
-- does not already have: RLS on goals already lets a member update their own
-- household's goals, and RLS on wealth_transactions already lets them read
-- their own household's ledger. Running it as the definer would add an
-- escalation surface to buy nothing. A caller who cannot see the goal locks
-- no row, gets NULL back, and changes nothing.

begin;

create or replace function public.recalc_goal_total(p_goal_id uuid)
returns numeric
language plpgsql
volatile
security invoker
set search_path to 'public'
as $function$
declare
  v_total numeric;
begin
  -- Take the row lock BEFORE reading the ledger. A concurrent caller waits
  -- here until we commit; when it proceeds, its sum is computed fresh and
  -- includes what we just wrote. Without this the recompute is still subject
  -- to the same stale-snapshot race it exists to fix.
  --
  -- RLS applies: this locks nothing the caller may not see.
  perform 1 from goals where id = p_goal_id for update;
  if not found then
    return null;  -- not this member's household, or the goal is gone
  end if;

  -- The same delta applySettlement uses: money out of an account and into the
  -- goal is progress; money coming back is progress undone.
  select coalesce(sum(case when t.direction = 'out' then t.amount else -t.amount end), 0)
    into v_total
    from wealth_transactions t
   where t.goal_id = p_goal_id
     and t.status = 'confirmed';

  update goals set current_amount = v_total where id = p_goal_id;
  return v_total;
end;
$function$;

-- Tighter than the default: functions in public are executable by PUBLIC
-- unless told otherwise, and there is no reason for an anonymous caller to
-- reach this one.
revoke execute on function public.recalc_goal_total(uuid) from public;
grant  execute on function public.recalc_goal_total(uuid) to authenticated;

commit;


-- How to run it
-- =============
--
-- STEP 1 -- look before you write. Read-only; changes nothing.
--
--   select g.id, g.title, g.current_amount as now_reads,
--          coalesce(sum(case when t.direction = 'out' then t.amount
--                            else -t.amount end), 0) as will_read
--     from goals g
--     left join wealth_transactions t
--       on t.goal_id = g.id and t.status = 'confirmed'
--    group by g.id, g.title, g.current_amount
--   having g.current_amount is distinct from
--          coalesce(sum(case when t.direction = 'out' then t.amount
--                            else -t.amount end), 0);
--
-- Every row this returns is a row the backfill in step 3 would change. On
-- 8 September that is exactly one: "Emergency fund" in the throwaway testbed,
-- 210,000 -> 0. If your own household appears in this list, STOP and tell me
-- before running step 3 -- it would mean current_amount is being set by some
-- path I have not found, and the whole premise of this migration is wrong.
--
-- STEP 2 -- create the function: everything above `commit;`. Safe on its own;
-- it only adds a function and changes no data. The app does not call it until
-- the accompanying code change ships, so there is no window where this is
-- half-applied and something is broken.
--
-- STEP 3 -- the backfill, which corrects existing drift. Optional and safe to
-- skip; safe to run any number of times.
--
--   update goals g
--      set current_amount = coalesce((
--            select sum(case when t.direction = 'out' then t.amount
--                            else -t.amount end)
--              from wealth_transactions t
--             where t.goal_id = g.id and t.status = 'confirmed'), 0)
--    where g.current_amount is distinct from coalesce((
--            select sum(case when t.direction = 'out' then t.amount
--                            else -t.amount end)
--              from wealth_transactions t
--             where t.goal_id = g.id and t.status = 'confirmed'), 0);
--
-- The WHERE clause means a second run touches nothing. Re-run step 1
-- afterwards: it should come back empty. That empty result is the
-- confirmation -- do not look for a row count, because the Supabase SQL
-- editor reports every UPDATE as "Success. No rows returned" whether it
-- changed forty rows or none. That is what went wrong this morning, and it is
-- why every statement here is written to be safe run twice and verified by a
-- SELECT rather than by the interface.
--
--
-- How to check it worked
-- ----------------------
--   select public.recalc_goal_total('<a goal id in your household>');
--
-- Returns that goal's total from the ledger, and leaves the row equal to it.
-- Call it twice; the second call must return the same number as the first.
-- If the two differ, this function is wrong and should not be relied on.
--
-- To roll back: drop function public.recalc_goal_total(uuid);
-- The column and its data are untouched by that, and the code change that
-- calls it would need reverting alongside.
