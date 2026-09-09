import { expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

/** Putting the throwaway household back the way the suite found it.
 *
 * The specs that drive forms have to leave rows behind to check their work --
 * that is the point of them. What they should not do is leave those rows there
 * afterwards, and for a long time they did: `docs/KNOWN_RISKS.md` recorded 612
 * of them cleared on 9 September, and by that evening writes.spec and
 * deletes.spec had put 162 more back, one batch per run.
 *
 * That is not only untidiness. Every spec that reads a list gets slower and
 * noisier as the household fills with a year of test data, and an assertion
 * like "the page shows the goal" quietly stops meaning anything once there are
 * thirty goals on it.
 *
 * The sweep runs as the QA account through the ordinary REST API rather than
 * with any elevated key, so row-level security decides what it can reach --
 * which means it physically cannot touch the Singian household even if a
 * prefix were wrong. That is the guarantee worth having in a file whose whole
 * job is deleting things.
 */

export type Rest = { ctx: APIRequestContext; url: string; headers: Record<string, string> };

/** Signs the throwaway account in, or returns null when the environment has
 * no Supabase details -- the same condition under which the specs that need
 * them skip. A null here means nothing was created, so there is nothing to
 * clean up either. */
export async function restAsQa(): Promise<Rest | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!url || !key || !email || !password) return null;

  const ctx = await playwrightRequest.newContext();
  const auth = await ctx.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email, password },
  });
  if (!auth.ok()) {
    await ctx.dispose();
    // Deliberately loud. A tidy-up that cannot sign in is a tidy-up that is
    // silently not happening, which is exactly how the rows piled up before.
    throw new Error(`Could not sign the throwaway account in to tidy up: ${auth.status()} ${await auth.text()}`);
  }
  return { ctx, url, headers: { apikey: key, Authorization: `Bearer ${(await auth.json()).access_token}` } };
}

/** A kind of row the form specs create, and the column its run id lands in.
 *
 * Everything else that hangs off these cascades on delete -- activity_members,
 * journal_entry_people, meal_ingredients, routine_members and the rest -- so
 * they need no mention here. The two exceptions are named:
 *
 *   `ledger`   wealth_transactions.goal_id is ON DELETE SET NULL, so deleting
 *              a goal does not remove what was contributed to it; it leaves a
 *              ledger row pointing at nothing.
 *   `calendar` calendar_event_links has no foreign key at all -- it finds its
 *              row through a (source_table, source_id) pair -- so nothing in
 *              the database removes a link when its subject goes. The QA
 *              household has no Google token today and so no links, but that
 *              is one connected calendar away from being untrue.
 */
type Swept = { table: string; column: string; ledger?: true; calendar?: string };

const SWEPT: Swept[] = [
  { table: "activities", column: "title", calendar: "activities" },
  { table: "journal_entries", column: "title" },
  { table: "milestones", column: "title" },
  { table: "goals", column: "title", ledger: true, calendar: "goals" },
  { table: "assets", column: "name" },
  { table: "meal_plans", column: "dish", calendar: "meal_plans" },
  { table: "routines", column: "title", calendar: "routines" },
];

async function idsMatching(rest: Rest, kind: Swept, prefix: string): Promise<string[]> {
  const res = await rest.ctx.get(
    `${rest.url}/rest/v1/${kind.table}?select=id&${kind.column}=like.${encodeURIComponent(prefix)}*`,
    { headers: rest.headers },
  );
  if (!res.ok()) throw new Error(`Could not list ${kind.table} to tidy up: ${res.status()} ${await res.text()}`);
  return ((await res.json()) as { id: string }[]).map((r) => r.id);
}

/** Removes every row carrying this prefix, then proves it. Call it from an
 * `afterAll`; it is safe to call when the run made nothing.
 *
 * The prefix is the spec's fixed family name -- "E2E-WRITES", "E2E-DEL" --
 * and NOT the per-run id, which was the first thing tried and does not work.
 * Playwright loads a spec file once in the process that collects the tests
 * and again in the worker that runs them, so a `Date.now()` at module scope
 * takes two different values in a single run:
 *
 *   [module] writes.spec loaded, RUN=E2E-mttxxanw, pid=10709   <- collection
 *   [module] writes.spec loaded, RUN=E2E-mttxxgf2, pid=10832   <- worker
 *
 * Only the worker writes rows, so that alone is survivable. What is not is a
 * module reloaded part-way through -- a restarted worker, or a stale entry in
 * Playwright's transform cache -- which takes a third id and leaves the sweep
 * knowing nothing about the rows written under the second. That is how a
 * suite whose every tidy-up reported "survivors=[]" still left rows behind,
 * measured on 9 September.
 *
 * A fixed family name has none of that: it is the same string in every
 * process and every reload, and it collects orphans from a crashed or killed
 * run on a previous day as well.
 *
 * The cost of that is real and worth stating plainly. Within one machine the
 * suite never overlaps itself -- e2e.yml holds a repo-wide concurrency group
 * of one, and the config is workers: 1, fullyParallel: false. Across machines
 * it can and does: both people's sessions run in their own container against
 * their own clone, but there is one Supabase project and one E2E_EMAIL, so
 * two suites started minutes apart share a household. That was measured here
 * on 9 September, and it is what made the tidy-up look broken for an hour --
 * rows kept appearing under a prefix this file had not used since a change
 * fifteen minutes earlier, while every sweep truthfully reported nothing
 * left of its own.
 *
 * So a sweep can take rows out from under somebody else's run in flight, and
 * a spec can fail because a stranger's tidy-up removed what it was about to
 * look for. Neither can reach the real household -- RLS sees to that -- and
 * neither corrupts anything. The fix is a second QA household rather than a
 * cleverer prefix; until there is one, the rule is the ordinary courtesy of
 * saying before you run the full suite.
 *
 * It asserts rather than hoping. A delete refused by a policy comes back 200
 * with an empty body from PostgREST, so "the request succeeded" says nothing
 * at all about whether the row is gone -- the only honest check is to look
 * again. Every table is checked before anything is reported, so one run names
 * all of what it could not remove instead of the first thing. */
export async function tidyUpAfter(prefix: string): Promise<void> {
  const rest = await restAsQa();
  if (!rest) return;

  const survivors: string[] = [];
  try {
    for (const kind of SWEPT) {
      const ids = await idsMatching(rest, kind, prefix);
      if (ids.length === 0) continue;
      const list = `(${ids.join(",")})`;

      if (kind.calendar) {
        await rest.ctx.delete(
          `${rest.url}/rest/v1/calendar_event_links?source_table=eq.${kind.calendar}&source_id=in.${list}`,
          { headers: rest.headers },
        );
      }
      if (kind.ledger) {
        await rest.ctx.delete(`${rest.url}/rest/v1/wealth_transactions?goal_id=in.${list}`, { headers: rest.headers });
      }

      await rest.ctx.delete(`${rest.url}/rest/v1/${kind.table}?id=in.${list}`, { headers: rest.headers });

      const left = await idsMatching(rest, kind, prefix);
      if (left.length > 0) survivors.push(`${kind.table}: ${left.length} of ${ids.length} left`);
    }
  } finally {
    await rest.ctx.dispose();
  }

  expect(survivors, `rows this run created are still in the throwaway household -- ${survivors.join("; ")}`).toEqual([]);
}
