import fs from "node:fs";
import path from "node:path";
import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";

/** Five key screens at phone width, Simple Kin off and on, as pictures.
 *
 * smoke.spec.ts proves a page renders without errors; it cannot see a card
 * that moved under another, a button pushed off the right edge, or Simple
 * Kin's bigger text wrapping a heading into the item below it (#747 was
 * exactly that, at 320px). This takes a 390px screenshot of Today, Chat,
 * Planner, To-Buy and Wealth, first as the sample member usually is, then
 * with Simple Kin on, and compares each with the same screenshot from main
 * (CI's last run on main uploads them; e2e.yml downloads them here into
 * e2e/visual-baseline/). A difference above the threshold fails the test
 * (since 21 October; warn-only before) unless the screen is accepted for
 * this pull request in e2e/visual-accept.txt. VISUAL_WARN_ONLY=1 still turns
 * failing off, for a run that must only look.
 *
 * Accepting an intended change: the baseline is main's last run, not a file,
 * so it refreshes itself once the pull request merges. Until then add a line
 * "<slug> #<pull request number>" to e2e/visual-accept.txt in the same pull
 * request (the failure message prints the exact line). It counts only for
 * that pull request; later ones are compared with the new picture.
 *
 * The clock is frozen (21 October). In the warn-only week, 3 of the 4
 * warnings across 35 pull-request runs were the clock, not the pull
 * request: main's baseline was from an earlier Manila day (the date, the
 * Planner's Today list) or an earlier time of day (Today's "This evening"
 * card comes and goes and moves every card below it). Those differed by
 * 5-9% of pixels, the one real change (#814's offer card) by 6%, so no
 * threshold tells them apart. Now e2e.yml sets VISUAL_FROZEN_AT to the
 * last 06:00 in Manila (22:00 UTC): the server starts at that moment under
 * libfaketime (playwright.config.ts) and the browser's Date is fixed to it.
 * Behind real time, never ahead: a session token from now is still unexpired
 * on a clock up to a day behind, and rows written since (smoke's ticks)
 * fall in the frozen clock's future, out of view. A baseline is compared
 * only if it was taken at the same frozen moment (frozen-at.txt beside it);
 * one from another day is recorded as no baseline, not failed.
 *
 * What is NOT fixed: the household's data. A new message in Chat would move
 * pixels; in 35 runs none did. Hence a ratio threshold rather than
 * pixel-perfect, the viewport only rather than the whole page (a longer list
 * is not a layout bug), and light theme only (smoke covers dark). A baseline
 * that does not exist yet (the first run, a new screen) is noted, not failed.
 *
 * Everything this writes to the sample household is one member row's
 * simple_mode and text_scale, and it puts them back. It runs on its own,
 * after the smoke run and with one worker: flipping Simple Kin while smoke
 * loads Today in parallel would change what smoke sees.
 *
 * Output, for e2e.yml: visual-out/<slug>.png for every screen (main's run
 * keeps these as the next baseline, with visual-out/frozen-at.txt),
 * visual-out/<slug>-diff.png where one differed, and visual-out/report.json
 * saying which did and by how much. */

const SCREENS = [
  { name: "Today", path: "/today" },
  { name: "Chat", path: "/chat" },
  { name: "Planner", path: "/planner" },
  { name: "To-Buy", path: "/household?seg=buy" },
  { name: "Wealth", path: "/wealth" },
];

/** Share of pixels that may differ before a screen counts as changed. A
 * date or one new list line is well under 1%; a card out of place or text
 * off the edge is far over 3%. Tune in the warn-only week (e2e.yml). */
const MAX_DIFF_RATIO = 0.03;

const WARN_ONLY = process.env.VISUAL_WARN_ONLY === "1";
/** The pull request under test (e2e.yml); unset on main and locally. */
const PR = process.env.VISUAL_PR ?? "";
const ACCEPTED = new Set(
  (() => {
    try {
      return fs.readFileSync(path.join(process.cwd(), "e2e", "visual-accept.txt"), "utf8").split("\n");
    } catch {
      return [];
    }
  })()
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !l.startsWith("//")),
);
const OUT = path.join(process.cwd(), "visual-out");
const BASELINE = path.join(process.cwd(), "e2e", "visual-baseline");
/** "YYYY-MM-DD HH:MM:SS", UTC, from e2e.yml; unset locally (real clock). */
const FROZEN_AT = process.env.VISUAL_FROZEN_AT ?? "";
const baselineFrozenAt = () => {
  try {
    return fs.readFileSync(path.join(BASELINE, "frozen-at.txt"), "utf8").trim();
  } catch {
    return "";
  }
};

type Row = { name: string; mode: "off" | "on"; slug: string; status: "same" | "changed" | "accepted" | "no-baseline"; ratio: number | null; detail?: string };
const rows: Row[] = [];
const slugOf = (name: string, mode: "off" | "on") => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-simple-${mode}`;

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, colorScheme: "light" });

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "frozen-at.txt"), FROZEN_AT);
});

test.afterAll(() => {
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ warnOnly: WARN_ONLY, maxDiffRatio: MAX_DIFF_RATIO, frozenAt: FROZEN_AT, baselineFrozenAt: baselineFrozenAt(), screens: rows }, null, 2));
});

async function shoot(page: Page, context: Parameters<Parameters<typeof test>[2]>[0]["context"], baseURL: string, screen: (typeof SCREENS)[number], mode: "off" | "on") {
  await context.addCookies([{ name: "kin-theme", value: "light", url: baseURL }]);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  // The browser's half of the frozen clock: client components that read
  // new Date() see the same moment the server started at. Timers still run.
  if (FROZEN_AT) await page.clock.setFixedTime(new Date(`${FROZEN_AT.replace(" ", "T")}Z`));
  const response = await page.goto(screen.path, { waitUntil: "networkidle" });
  expect(response?.status(), `${screen.path} should serve 200`).toBe(200);
  // A session the server would not accept ends on /login, which also serves
  // 200; a picture of the sign-in form compared with main's proves nothing.
  expect(new URL(page.url()).pathname, `${screen.path} should not redirect`).toBe(screen.path.split("?")[0]);
  // Lazy images and the last layout pass; the smoke run has already proved
  // the page itself is sound, so this is only about the picture settling.
  await page.waitForTimeout(500);

  const slug = slugOf(screen.name, mode);
  const actual = await page.screenshot({ animations: "disabled", caret: "hide" });
  fs.writeFileSync(path.join(OUT, `${slug}.png`), actual);

  const baseline = path.join(BASELINE, `${slug}.png`);
  if (!fs.existsSync(baseline)) {
    rows.push({ name: screen.name, mode, slug, status: "no-baseline", ratio: null });
    test.info().annotations.push({ type: "no baseline", description: `${slug}: nothing from main to compare with yet` });
    return;
  }
  // Main's last run was at another frozen moment (before today's 06:00 in
  // Manila, or before the clock was frozen at all): its date and time of day
  // differ from this run's, which is exactly the noise freezing removed.
  if (baselineFrozenAt() !== FROZEN_AT) {
    const detail = `main's screenshots are from ${baselineFrozenAt() || "an unfrozen clock"}, this run from ${FROZEN_AT || "an unfrozen clock"}`;
    rows.push({ name: screen.name, mode, slug, status: "no-baseline", ratio: null, detail });
    test.info().annotations.push({ type: "no baseline", description: `${slug}: ${detail}` });
    return;
  }
  try {
    expect(actual).toMatchSnapshot(`${slug}.png`, { maxDiffPixelRatio: MAX_DIFF_RATIO });
    rows.push({ name: screen.name, mode, slug, status: "same", ratio: 0 });
  } catch (e) {
    // Without the terminal colours, and the line that says how much:
    // "1234 pixels (ratio 0.04 of all image pixels) are different" -- or a
    // size mismatch, which has no ratio and is a change in itself.
    const message = String((e as Error).message ?? e).replace(/\x1b\[[0-9;]*m/g, "");
    const detail = (message.split("\n").find((l) => /pixels|Expected an image/.test(l)) ?? message.split("\n")[0]).trim().slice(0, 200);
    const ratio = Number(message.match(/ratio ([\d.]+) of all image pixels/)?.[1] ?? NaN);
    const diff = fs.readdirSync(test.info().outputDir).find((f) => f.startsWith(slug) && f.endsWith("-diff.png"));
    if (diff) fs.copyFileSync(path.join(test.info().outputDir, diff), path.join(OUT, `${slug}-diff.png`));
    const acceptLine = `${slug} #${PR || "<pull request number>"}`;
    const accepted = PR !== "" && ACCEPTED.has(acceptLine);
    rows.push({ name: screen.name, mode, slug, status: accepted ? "accepted" : "changed", ratio: Number.isNaN(ratio) ? null : ratio, detail });
    if (accepted) {
      test.info().annotations.push({ type: "changed (accepted)", description: `${slug}: ${detail}` });
      return;
    }
    if (WARN_ONLY) {
      test.info().annotations.push({ type: "changed (warn-only)", description: `${slug}: ${detail}` });
      return;
    }
    throw new Error(
      `${screen.name} (Simple Kin ${mode}) at 390px differs from main's: ${detail}\n\n` +
        `Look at the before/after pictures in this pull request's "Phone screenshots" comment. ` +
        `If the change is the one this pull request means to make, accept it here by adding this line ` +
        `to kin/e2e/visual-accept.txt and pushing:\n\n    ${acceptLine}\n\n` +
        `Main's screenshots become the new baseline once this merges. If the change is not intended, it is a layout bug.`,
    );
  }
}

test.describe("Simple Kin off", () => {
  for (const screen of SCREENS) {
    test(`${screen.name} at 390px`, async ({ page, context, baseURL }) => {
      await shoot(page, context, baseURL!, screen, "off");
    });
  }
});

/** The same five with Simple Kin on: the sample member's own row, patched
 * as themself under their own row-level security (as simple-mode.spec.ts
 * does), and put back afterwards whatever happened in between. */
test.describe("Simple Kin on", () => {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let token: string;
  let memberId: string;
  let original: { simple_mode: boolean; text_scale: number } | null = null;

  async function patchMe(patch: Record<string, unknown>) {
    const api = await playwrightRequest.newContext();
    const res = await api.patch(`${SUPABASE_URL}/rest/v1/members?id=eq.${memberId}`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: patch,
    });
    await api.dispose();
    return res.ok();
  }

  test.beforeAll(async () => {
    test.skip(!SUPABASE_URL || !SUPABASE_KEY, "Supabase values are not set; skipping Simple Kin on.");
    const api = await playwrightRequest.newContext();
    const auth = await api.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: { apikey: SUPABASE_KEY!, "Content-Type": "application/json" },
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(auth.ok(), "could not sign the sample account in").toBeTruthy();
    const session = await auth.json();
    token = session.access_token;
    const res = await api.get(`${SUPABASE_URL}/rest/v1/members?auth_user_id=eq.${session.user.id}&select=id,simple_mode,text_scale`, {
      headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${token}` },
    });
    const list = res.ok() ? ((await res.json()) as { id: string; simple_mode: boolean; text_scale: number }[]) : [];
    await api.dispose();
    test.skip(!res.ok() || list.length === 0, "simple_mode is not on this database yet; skipping Simple Kin on.");
    const [row] = list;
    memberId = row.id;
    original = { simple_mode: row.simple_mode, text_scale: row.text_scale };
    expect(await patchMe({ simple_mode: true, text_scale: 130 })).toBeTruthy();
  });

  test.afterAll(async () => {
    if (original) await patchMe(original);
  });

  for (const screen of SCREENS) {
    test(`${screen.name} at 390px`, async ({ page, context, baseURL }) => {
      await shoot(page, context, baseURL!, screen, "on");
    });
  }
});
