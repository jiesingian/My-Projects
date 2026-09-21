import { test, expect } from "@playwright/test";
import { restAsQa, tidyUpAfter } from "./support/qa-household";

/** One test per bug that shipped, so none of them can ship twice.
 *
 * Each of these was found by driving the real app against real content, and
 * every one of them was invisible to a build, a type check and a lint. They
 * are written to fail loudly in the exact way the bug behaved.
 *
 * This file used to assert against content somebody had seeded into the
 * throwaway household by hand -- a check-up "due today", activities at 07:30
 * and 17:30. Those were dated Monday 7 September, and the Planner shows the
 * week you are in, so from Monday the 14th every one of them would have gone
 * red at once on both machines: not a regression, just fixtures that had aged
 * out, wearing a regression's clothes. It makes its own now, anchored to
 * today, and clears them afterwards.
 */

const FAMILY = "E2E-REGR";
const RUN = `${FAMILY}-${Date.now().toString(36)}`;

/* Distinctive minutes, chosen rather than rounded. The bug these two exist to
 * catch read a Manila wall-clock time as if it were UTC, so 07:37 came out as
 * 23:37 the previous day. A unique minute makes both halves of that provable
 * from the page text alone -- 07:37 present, 23:37 absent -- without needing
 * to find the exact row it was rendered into, and without another fixture's
 * 7:30 being able to satisfy the assertion by accident. */
/* Two renderings, because the two pages disagree and always have: the Planner
 * writes 24-hour ("17:43") and Today writes 12-hour ("5:43 PM", no leading
 * zero). Asserting the wrong one is not a failure, it is a no-op -- the old
 * version of the Today test looked for a 24-hour string on a page that never
 * emits one, so it could not have failed however wrong the clock was. Both
 * forms are spelled out here so neither test can quietly become vacuous. */
const MORNING = { label: `${RUN} school run`, manila: "07:37", wrong: "23:37", manila12: "7:37 AM", wrong12: "11:37 PM" };
const EVENING = { label: `${RUN} grocery run`, manila: "17:43", wrong: "09:43", manila12: "5:43 PM", wrong12: "9:43 AM" };
const DUE_HEALTH = `${RUN} paediatric check-up`;
const MILESTONE = `${RUN} first day of school`;

/** Today where the household lives, which is the day these are filed under. */
function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** A Manila wall-clock time today, as the instant the database stores.
 * Asia/Manila is UTC+8 all year -- no daylight saving ever -- so this is
 * exact arithmetic rather than an approximation. */
function manilaInstant(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(`${manilaToday()}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+08:00`).toISOString();
}

test.beforeAll(async () => {
  const rest = await restAsQa();
  test.skip(!rest, "Supabase details are not set; these drive seeded content.");
  if (!rest) return;
  try {
    const members = await (await rest.ctx.get(`${rest.url}/rest/v1/members?select=id,family_id&order=created_at`, { headers: rest.headers })).json();
    expect(members.length, "the throwaway household has no members to file anything against").toBeGreaterThan(0);
    const { family_id: familyId, id: memberId } = members[0];
    const post = async (table: string, rows: unknown[]) => {
      const r = await rest.ctx.post(`${rest.url}/rest/v1/${table}`, {
        headers: { ...rest.headers, "Content-Type": "application/json", Prefer: "return=representation" },
        data: rows,
      });
      expect(r.ok(), `could not seed ${table}: ${r.status()} ${await r.text()}`).toBeTruthy();
    };

    await post("activities", [
      { family_id: familyId, created_by: memberId, title: MORNING.label, start_at: manilaInstant(MORNING.manila), repeat: "once", status: "upcoming", applies_to_whole_family: true },
      { family_id: familyId, created_by: memberId, title: EVENING.label, start_at: manilaInstant(EVENING.manila), repeat: "once", status: "upcoming", applies_to_whole_family: true },
    ]);
    await post("health_schedule", [
      { family_id: familyId, created_by: memberId, member_id: memberId, what: DUE_HEALTH, when_date: manilaToday(), status: "due" },
    ]);
    await post("milestones", [
      { family_id: familyId, created_by: memberId, member_id: memberId, title: MILESTONE, milestone_date: manilaToday() },
    ]);
  } finally {
    await rest.ctx.dispose();
  }
});

test.afterAll(async () => {
  await tidyUpAfter(FAMILY);
});

test.describe("bugs that already got out once", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** PGRST201. health_schedule holds two references to members -- the person
   * it is about and whoever wrote it down -- so an unqualified members()
   * embed is ambiguous and PostgREST returns nothing rather than erroring
   * anywhere visible. The briefing simply had no health in it, ever. */
  test("a due health item reaches the Today briefing", async ({ page }) => {
    await page.goto("/today", { waitUntil: "networkidle" });
    const briefing = page.locator("body");

    // The item this run filed as due, rather than whatever happened to be in
    // the household already.
    await expect(briefing).toContainText(DUE_HEALTH);

    // And the Family hub card must not claim there is nothing, nor tell a
    // household that plainly has members to go and add one.
    await expect(briefing).not.toContainText(/Nothing due — add a member to get started/i);
  });

  /** The same ambiguous embed, on milestones. The tab looked like nowhere had
   * ever recorded one. */
  test("milestones are listed", async ({ page }) => {
    await page.goto("/journal?view=milestones", { waitUntil: "networkidle" });
    // The one this run recorded. The old version looked for any date-shaped
    // text anywhere on the page, which a footer or an unrelated row would
    // satisfy just as well as a milestone would.
    await expect(page.locator("body")).toContainText(MILESTONE);
  });

  /** The server ran in UTC while the household lives in Manila, so a 07:30
   * Monday school run was an instant at 23:30 on Sunday, and the Planner
   * filed it under Sunday night. Wrong day, not merely wrong time. */
  test("the Planner shows the household's own clock", async ({ page }) => {
    await page.goto("/planner", { waitUntil: "networkidle" });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    // Both were filed at a Manila wall-clock time today. Read as UTC they
    // would come out eight hours earlier -- the morning one on yesterday's
    // date. Asserting the wrong time is absent as well as the right one
    // present is what makes this a test of the clock rather than of whether
    // anything at all rendered.
    expect(text, `the morning activity should read ${MORNING.manila}`).toContain(MORNING.manila);
    expect(text, `and never ${MORNING.wrong}, which is that time read as UTC`).not.toContain(MORNING.wrong);
    expect(text, `the evening activity should read ${EVENING.manila}`).toContain(EVENING.manila);
    expect(text, `and never ${EVENING.wrong}, which is that time read as UTC`).not.toContain(EVENING.wrong);
  });

  /** Today's hub card formatted without a timezone while the briefing above it
   * formatted with one, so the same activity appeared twice on one page at two
   * different times. */
  test("Today's hub card agrees with the briefing above it", async ({ page }) => {
    await page.goto("/today", { waitUntil: "networkidle" });
    const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    // The activity has to be on the page before "the wrong time is absent"
    // means anything -- on its own that assertion is satisfied by an empty
    // page, which is how it would have kept passing after its fixture aged
    // out. Both halves, in order.
    expect(text, "this run's evening activity should be on Today at all").toContain(EVENING.label);
    expect(text, `it should read ${EVENING.manila12}`).toContain(EVENING.manila12);
    expect(text, "the hub card must not be eight hours off").not.toContain(EVENING.wrong12);
    // The morning one too, since the bug moved it across a day boundary and
    // this is the page where that showed up as two different times at once.
    expect(text, `the morning activity should read ${MORNING.manila12}`).toContain(MORNING.manila12);
    expect(text, `and never ${MORNING.wrong12}`).not.toContain(MORNING.wrong12);
  });

  /** Chat is a client component that formatted timestamps in whichever zone
   * the reader's browser happened to be in, so the server and the browser
   * rendered different text and React discarded the thread on every load. */
  test("the chat thread survives hydration", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto("/chat", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    expect(pageErrors.filter((e) => /hydration/i.test(e)), "chat hydration mismatch is back").toEqual([]);
  });

  /** The Ask Kin button floats over the page, which is its job, but nothing
   * reserved room for it, so the last rows of a fully scrolled page sat under
   * it permanently and could not be read. */
  for (const [label, width, height] of [
    ["phone", 390, 844],
    ["tablet", 834, 1112],
    ["desktop", 1440, 900],
  ] as const) {
    test(`nothing is trapped under the Ask Kin button on ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const path of ["/household", "/wealth", "/today"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(500);

        const trapped = await page.evaluate(() => {
          const fixed = Array.from(document.querySelectorAll("button,a")).filter(
            (e) => getComputedStyle(e).position === "fixed",
          );
          const fab = fixed
            .map((e) => ({ e, r: e.getBoundingClientRect() }))
            .filter((o) => o.r.width > 40 && o.r.width < 90 && o.r.height > 40 && o.r.height < 90)
            .sort((a, b) => b.r.top - a.r.top)[0];
          if (!fab) return null;

          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n: Node | null;
          while ((n = walker.nextNode())) {
            const t = n.textContent?.trim();
            if (!t) continue;
            const el = n.parentElement;
            if (!el || fab.e.contains(el) || el.closest("nav")) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width < 2 || rect.height < 2) continue;
              const ix = Math.min(rect.right, fab.r.right) - Math.max(rect.left, fab.r.left);
              const iy = Math.min(rect.bottom, fab.r.bottom) - Math.max(rect.top, fab.r.top);
              if (ix > 2 && iy > 2) return t.slice(0, 60);
            }
          }
          return null;
        });

        expect(trapped, `${path} hides text under the button at ${label}`).toBeNull();
      }
    });
  }
});
