-- NOT YET APPLIED. Jonathan runs this; nothing here has been run against the
-- database.
--
-- Security fix: anyone in the household can set anyone else's revenue target
-- ========================================================================
--
-- What is wrong
-- -------------
-- wealth_targets is private to read and open to write. The policies as they
-- stand:
--
--   SELECT  family_id = current_family_id() AND member_id = current_member_id()
--   INSERT  family_id = current_family_id()
--   UPDATE  family_id = current_family_id()          (no WITH CHECK, so
--                                                     Postgres reuses USING)
--
-- The SELECT policy says a target belongs to one person. Neither write policy
-- agrees. So any member of a household can set, or silently overwrite, any
-- other member's monthly revenue target -- and because the SELECT policy is
-- the strict one, they cannot then see what they did, and the person whose
-- target it is has no way to tell where the number came from.
--
-- The application says the right thing and cannot enforce it. src/app/(app)/
-- wealth/page.tsx renders the control only for your own pane, with the comment
--
--     {/* Only your own target is yours to set. */}
--
-- but that is a guard in the browser, which is the one place an attacker does
-- not have to visit. setWealthTargetAction then took both the member id and
-- the family id as arguments from the client, so the server passed them
-- straight through to a policy that did not check the member.
--
-- Reproduced, 8 September, against the throwaway household
-- -------------------------------------------------------
-- Signed in as Quinn Tester (parent), writing Alex Tester's target:
--
--   POST /rest/v1/wealth_targets
--   {"member_id": "<Alex>", "family_id": "<theirs>",
--    "period_month": 9, "period_year": 2026, "target_amount": 999999}
--
--   -> 201 Created.
--
-- The row was confirmed present as Alex's, then removed. The Singian
-- household was not touched at any point.
--
-- (A first attempt at this returned 403 and nearly had it written off as
-- already-safe. That run asked for `Prefer: return=representation`, and the
-- SELECT policy refuses to return somebody else's row -- so the insert
-- succeeded and the read-back failed, with an error naming the insert. Worth
-- recording: a refusal on a write that asks for its row back may be the read
-- being refused, not the write.)
--
-- Why it matters
-- --------------
-- Small in blast radius -- it is one number, inside one household, and
-- everyone there is family. But it is a rule the app states plainly and does
-- not hold, which is the same shape as the managed-child escalation fixed
-- this morning: a guard that exists in the layer that cannot enforce it.
-- The anon key is public by design, so "only our own UI calls this" is not a
-- control.
--
-- The fix
-- -------
-- Make the write policies agree with the read policy. A target is your own.
--
-- The code half is already done and needs nobody to run anything:
-- setWealthTargetAction now takes the member and the household from the
-- session instead of from its arguments. This is the half that holds when
-- someone talks to PostgREST directly.
--
-- Deliberately NOT changed:
--
--   budget_periods   the household budget is the household's; family scope is
--                    correct there, and every adult may set it.
--   omron_links      family-scoped on purpose: a parent linking a child's
--                    blood-pressure monitor is the ordinary case, so
--                    current_member_id() would be the wrong test. Its data is
--                    family-visible by design. The action now takes the
--                    household from the session all the same.

begin;

drop policy if exists wealth_targets_insert on public.wealth_targets;
create policy wealth_targets_insert on public.wealth_targets
  for insert
  with check (family_id = current_family_id() and member_id = current_member_id());

-- USING decides which rows you may reach; WITH CHECK decides what you may
-- leave behind. Stating both means an UPDATE can neither touch somebody
-- else's row nor hand your own row to them.
drop policy if exists wealth_targets_update on public.wealth_targets;
create policy wealth_targets_update on public.wealth_targets
  for update
  using       (family_id = current_family_id() and member_id = current_member_id())
  with check  (family_id = current_family_id() and member_id = current_member_id());

commit;


-- How to check it worked
-- ======================
--
-- STEP 1 -- what the policies now say. Read-only.
--
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'wealth_targets'
--    order by cmd;
--
-- Both insert and update should now name member_id. select is unchanged.
--
-- STEP 2 -- the reproduction above must stop working. As a signed-in member,
-- against another member of your own household:
--
--   POST /rest/v1/wealth_targets
--   {"member_id": "<someone else>", "family_id": "<yours>",
--    "period_month": 9, "period_year": 2026, "target_amount": 999999}
--
-- Before: 201 Created.
-- After:  403, "new row violates row-level security policy".
--
-- Do not send `Prefer: return=representation` when checking this, for the
-- reason in the note above -- it makes a success look like a failure.
--
-- STEP 3 -- and your own must still work, which is the half worth checking
-- twice, because a policy that refuses everything also passes step 2:
--
--   POST /rest/v1/wealth_targets
--   {"member_id": "<you>", "family_id": "<yours>",
--    "period_month": 9, "period_year": 2026, "target_amount": 50000}
--
-- That should still be accepted, and SET TARGET on your own pane in the
-- Wealth hub should still work. e2e/authorization.spec.ts covers both
-- directions from here on.
--
-- To roll back, restore the two policies with the family-only predicates
-- quoted at the top of this file.
