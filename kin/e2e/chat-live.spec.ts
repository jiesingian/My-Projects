import { test, expect, type Browser, type Page } from "@playwright/test";
import { restAsQa, type Rest } from "./support/qa-household";
import { restAsPartner, ensurePartnerInHousehold } from "./support/qa-partner";

/** Two people in one group chat, each in their own browser -- the test a
 * person used to do with two phones side by side.
 *
 * Everything the chat does live travels over Supabase Realtime: a new
 * message, an edit, an unsend and a pin arrive as postgres_changes, a poll
 * vote and a reaction likewise, and "is typing…" is presence on the same
 * private channel. None of it can be seen from one login. Every other chat
 * spec is one person, or a pure function; this is the only check that the
 * other person's screen moves without a refresh.
 *
 * It cannot run in the agent sandbox, whose proxy does no WebSocket upgrades
 * (the channel never joins and every "live" step times out). GitHub's
 * runners can, so it runs in CI: e2e.yml on every pull request that touches
 * kin/, and weekly-check.yml with the rest of the suite.
 *
 * Quinn is the QA account (E2E_EMAIL, the suite's signed-in state); Pat is the
 * second grown-up in the same throwaway household (E2E_PARTNER_EMAIL,
 * docs/QA_HOUSEHOLDS.md). Without Pat's login it skips and says so.
 *
 * One group, made once and reused by every run, so runs don't leave a trail
 * of groups behind (nothing may delete a group). afterAll takes this run's
 * messages back out as Quinn, its admin; polls, votes and reactions go with
 * their messages. */

const GROUP = "E2E live chat";
const RUN = `live-${Date.now().toString(36)}`;

/** The live steps wait this long for the other screen to move: Realtime is
 * usually well under a second, and a refresh is a full server render on a
 * busy dev project. */
const LIVE = 20_000;

async function json<T>(rest: Rest, path: string): Promise<T> {
  const res = await rest.ctx.get(`${rest.url}/rest/v1/${path}`, { headers: rest.headers });
  expect(res.ok(), `${path}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function rpc<T>(rest: Rest, fn: string, data: Record<string, unknown>): Promise<T> {
  const res = await rest.ctx.post(`${rest.url}/rest/v1/rpc/${fn}`, { headers: { ...rest.headers, "Content-Type": "application/json" }, data });
  expect(res.ok(), `${fn}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function personOf(rest: Rest): Promise<{ personId: string; familyId: string }> {
  const user = await rest.ctx.get(`${rest.url}/auth/v1/user`, { headers: rest.headers });
  expect(user.ok()).toBeTruthy();
  const { id } = (await user.json()) as { id: string };
  const rows = await json<{ person_id: string; family_id: string }[]>(rest, `members?select=person_id,family_id&auth_user_id=eq.${id}`);
  expect(rows.length, "no member row for this login").toBe(1);
  return { personId: rows[0].person_id, familyId: rows[0].family_id };
}

/** The group, with Pat in it: found if an earlier run made it, made if not. */
async function liveGroup(qa: Rest, patPerson: string): Promise<string> {
  const found = await json<{ id: string }[]>(qa, `chat_groups?select=id&name=eq.${encodeURIComponent(GROUP)}&order=created_at.asc&limit=1`);
  if (found.length === 0) return rpc<string>(qa, "create_chat_group", { p_name: GROUP, p_announce_only: false, p_people: [patPerson] });
  const id = found[0].id;
  const pat = await json<unknown[]>(qa, `chat_group_members?select=person_id&group_id=eq.${id}&person_id=eq.${patPerson}`);
  if (pat.length === 0) await rpc(qa, "add_chat_group_members", { p_group: id, p_people: [patPerson] });
  return id;
}

async function signInAsPat(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 }, timezoneId: "America/New_York", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.fill('input[name="email"]', process.env.E2E_PARTNER_EMAIL!);
  await page.fill('input[name="password"]', process.env.E2E_PARTNER_PASSWORD!);
  await page.click('button[type="submit"]');
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  return page;
}

const bubble = (page: Page, text: string) => page.locator("button.kin-bubble", { hasText: text }).last();

async function send(page: Page, text: string) {
  await page.locator("textarea.kin-composer-field").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bubble(page, text)).toBeVisible();
}

async function act(page: Page, text: string, word: "Edit" | "Pin" | "Unsend") {
  await bubble(page, text).click();
  await page.locator(".kin-room-actions").getByRole("button", { name: word, exact: true }).click();
}

test.describe("a group chat, live on the other person's screen", () => {
  let qa: Rest | null = null;
  let partner: Rest | null = null;
  let groupId = "";

  test.beforeAll(async () => {
    partner = await restAsPartner();
    if (!partner) console.warn("\n*** chat-live.spec SKIPPED: E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD are not set. Live chat was NOT checked. ***\n");
    test.skip(!partner, "E2E_PARTNER_EMAIL / E2E_PARTNER_PASSWORD are not set -- live chat was NOT checked (docs/QA_HOUSEHOLDS.md).");
    qa = await restAsQa();
    test.skip(!qa, "Supabase details are not set.");
    const quinn = await personOf(qa!);
    await ensurePartnerInHousehold(qa!, partner!, quinn.familyId);
    const pat = await personOf(partner!);
    groupId = await liveGroup(qa!, pat.personId);
  });

  test.afterAll(async () => {
    try {
      if (!qa || !groupId) return;
      // This run's messages only: weekly-check.yml's run of this spec can
      // overlap a pull request's, in the same group. Its poll is found by
      // its question, and an unsent message has no words left to match, so
      // every unsent one goes -- there is nothing in it to keep.
      const polls = await json<{ message_id: string }[]>(qa, `group_polls?select=message_id&group_id=eq.${groupId}&question=like.${encodeURIComponent(RUN)}*`);
      const ids = polls.map((p) => p.message_id);
      const del = (filter: string) => qa!.ctx.delete(`${qa!.url}/rest/v1/chat_group_messages?group_id=eq.${groupId}&${filter}`, { headers: qa!.headers });
      await del(`body=like.${encodeURIComponent(RUN)}*`);
      await del("deleted_at=not.is.null");
      if (ids.length) await del(`id=in.(${ids.join(",")})`);
      // A refused delete comes back 200; look again.
      expect(await json<unknown[]>(qa, `chat_group_messages?select=id&group_id=eq.${groupId}&body=like.${encodeURIComponent(RUN)}*`), "messages this run left in the live group").toEqual([]);
    } finally {
      await qa?.ctx.dispose();
      await partner?.ctx.dispose();
    }
  });

  test("typing, a message, an edit, a pin, an unsend, a poll and a reaction reach the other screen without a refresh", async ({ page: quinn, browser }) => {
    test.setTimeout(240_000);
    await quinn.setViewportSize({ width: 390, height: 844 });
    const pat = await signInAsPat(browser);
    const url = `/chat/groups/${groupId}`;
    await Promise.all([quinn.goto(url), pat.goto(url)]);
    await Promise.all([expect(quinn.locator("textarea.kin-composer-field")).toBeVisible(), expect(pat.locator("textarea.kin-composer-field")).toBeVisible()]);
    // Both channels join after hydration; there is nothing on the page that
    // says so, and a typing signal sent before Pat has joined still arrives
    // (presence is state, not an event) -- this only keeps the first live
    // step from racing the join on a slow runner.
    await quinn.waitForTimeout(3_000);

    await test.step("Quinn types; Pat sees 'is typing…'", async () => {
      await quinn.locator("textarea.kin-composer-field").pressSequentially("hel", { delay: 80 });
      await expect(pat.locator(".kin-room-typing")).toContainText("is typing", { timeout: LIVE });
      await quinn.locator("textarea.kin-composer-field").fill("");
    });

    const first = `${RUN} lunch on Sunday?`;
    await test.step("Quinn sends; it appears on Pat's screen", async () => {
      await send(quinn, first);
      await expect(bubble(pat, first)).toBeVisible({ timeout: LIVE });
      await expect(pat.locator(".kin-room-typing")).toHaveCount(0, { timeout: LIVE });
    });

    const edited = `${RUN} lunch on Sunday, 12 noon?`;
    await test.step("Quinn edits; Pat sees the new words and 'edited'", async () => {
      await act(quinn, first, "Edit");
      await quinn.getByLabel("Edit this message").fill(edited);
      await quinn.locator(".kin-room-edit").getByRole("button", { name: "Save" }).click();
      await expect(bubble(pat, edited)).toBeVisible({ timeout: LIVE });
      await expect(pat.getByText("· edited").first()).toBeVisible({ timeout: LIVE });
    });

    await test.step("Quinn pins it; the banner appears for Pat", async () => {
      await act(quinn, edited, "Pin");
      await expect(pat.locator(".kin-chatpin")).toContainText("12 noon", { timeout: LIVE });
    });

    const oops = `${RUN} wrong chat`;
    await test.step("Quinn unsends; Pat sees 'Message removed'", async () => {
      await send(quinn, oops);
      await expect(bubble(pat, oops)).toBeVisible({ timeout: LIVE });
      await act(quinn, oops, "Unsend");
      await expect(pat.locator("button.kin-bubble", { hasText: oops })).toHaveCount(0, { timeout: LIVE });
      await expect(pat.locator(".kin-bubble-removed").last()).toBeVisible();
    });

    await test.step("Pat reacts; Quinn sees it", async () => {
      await bubble(pat, edited).click();
      await pat.locator(".kin-room-actions").getByRole("button", { name: "React 👍" }).click();
      await expect(quinn.locator(".kin-room-reactions").getByRole("button", { name: /👍 from Pat/ })).toBeVisible({ timeout: LIVE });
    });

    const question = `${RUN} dinner tonight?`;
    await test.step("Quinn asks a poll; Pat votes; Quinn sees the vote", async () => {
      await quinn.getByRole("button", { name: "Ask a poll" }).click();
      await quinn.getByLabel("Poll question").fill(question);
      await quinn.getByLabel("Answer 1").fill("Adobo");
      await quinn.getByLabel("Answer 2").fill("Sinigang");
      await quinn.getByRole("button", { name: "Ask", exact: true }).click();
      const patPoll = pat.locator(".kin-room-poll", { hasText: question });
      await expect(patPoll).toBeVisible({ timeout: LIVE });
      await patPoll.locator(".kin-room-poll-option", { hasText: "Sinigang" }).click();
      const quinnSinigang = quinn.locator(".kin-room-poll", { hasText: question }).locator(".kin-room-poll-option", { hasText: "Sinigang" });
      await expect(quinnSinigang.locator(".kin-room-poll-count")).toHaveText("1", { timeout: LIVE });
      await expect(quinnSinigang.locator(".kin-room-poll-who")).toContainText("Pat");
    });

    await test.step("Pat has read it: 'Seen by Pat' under Quinn's message", async () => {
      // Read receipts are drawn when the thread loads (group_seen_by); a
      // read is not pushed live, so this one reloads.
      await quinn.reload();
      await expect(quinn.locator(".kin-room-seen")).toContainText("Seen by Pat", { timeout: LIVE });
    });

    await pat.context().close();
  });
});
