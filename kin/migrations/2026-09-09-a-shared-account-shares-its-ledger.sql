-- APPLIED 9 September, on Jonathan's instruction, and verified after. The
-- checks are at the foot; they were run.
--
-- A shared account shares its ledger
-- ==================================
--
-- What this is for
-- ----------------
-- Two policies described the same account differently:
--
--   accounts             visible when joint OR mine OR NOT is_private
--   wealth_transactions  visible when joint OR mine
--
-- There is no `is_private` clause in the second. So the moment a member used
-- the "share this account with the household" toggle, the account itself
-- appeared in everybody's lists -- with its name, its institution and its
-- balance -- while every individual entry that made up that balance stayed
-- invisible to everyone but its owner.
--
-- That is not a privacy setting; it is two rules disagreeing. It also broke
-- something outright, which is how it was found: a transfer into such an
-- account wrote its two legs as two statements, and the second was refused at
-- the RETURNING while the first stood. Measured 9 September in the throwaway
-- household: 5,000 pesos left the joint account and arrived nowhere. The code
-- half of that is fixed already -- both legs now go in one statement -- and
-- this is the half that makes the refusal stop happening at all.
--
-- What "shared" now means
-- -----------------------
-- The same thing in both places. An account is either:
--
--   joint      the household's, always was
--   private    yours alone -- the default, and unchanged by this
--   shared     yours, and the household can see it: name, balance, AND the
--              entries that produced the balance
--
-- The third is the one that moved. Anybody who deliberately turned that
-- toggle on was already showing the household the number; this shows them
-- where the number came from, which is what somebody reading a shared
-- account is actually asking.
--
-- Nobody's private account is affected. is_private defaults to true, and on
-- 9 September every account in both households was either joint or private,
-- so this migration changed what nobody could see about anything that exists.
-- It changes what happens the next time somebody shares one.
--
-- Writing is unchanged
-- --------------------
-- The INSERT policy already allowed any member of the household to record a
-- movement against any of its accounts; only reading was narrow. So this adds
-- no new power to write, and takes none away.
--
--
-- HOW IT WAS RUN
-- ==============
-- Supabase dashboard -> SQL Editor. The statement below, then the checks.
--
-- STEP 1 -- what the old policy said, kept for the record. Read-only.
--
--   select policyname, qual from pg_policies
--    where schemaname='public' and tablename='wealth_transactions' and cmd='SELECT';
--
-- Before: ((family_id = current_family_id()) AND (EXISTS (SELECT 1 FROM
--   accounts a WHERE ((a.id = wealth_transactions.account_id) AND (a.is_joint
--   OR (a.owner_member_id = current_member_id()))))))
--
-- STEP 2 -- the replacement, below.
--   Expect "Success. No rows returned."
--
-- STEP 3 -- confirm the new clause is in place. Read-only.
--
--   select qual like '%is_private%' as mentions_private
--     from pg_policies
--    where schemaname='public' and tablename='wealth_transactions' and cmd='SELECT';
--
--   Expect one row, true.
--
-- STEP 4 -- confirm a private account is still private. Read-only: count the
-- transactions visible to nobody but their owner.
--
--   select a.name, a.is_joint, a.is_private, count(t.id) as entries
--     from public.accounts a
--     left join public.wealth_transactions t on t.account_id = a.id
--    group by 1,2,3 order by 1;
--
-- To roll back, restore the STEP 1 expression:
--
--   drop policy wealth_transactions_select on public.wealth_transactions;
--   create policy wealth_transactions_select on public.wealth_transactions
--     for select using (
--       family_id = current_family_id()
--       and exists (select 1 from public.accounts a
--                    where a.id = wealth_transactions.account_id
--                      and (a.is_joint or a.owner_member_id = current_member_id())));

drop policy if exists wealth_transactions_select on public.wealth_transactions;

create policy wealth_transactions_select on public.wealth_transactions
  for select using (
    family_id = current_family_id()
    and exists (
      select 1
        from public.accounts a
       where a.id = wealth_transactions.account_id
         and (a.is_joint or a.owner_member_id = current_member_id() or not a.is_private)
    )
  );
