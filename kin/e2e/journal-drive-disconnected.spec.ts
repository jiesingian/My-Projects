import { test, expect } from "@playwright/test";
import { restAsQa, type Rest } from "./support/qa-household";

/** When Drive dies, BOTH journal panes have to say so.
 *
 * On 14 September the household reported journal photos not loading. They are
 * Drive-backed, the Drive connection had died, and that is exactly what #59
 * was built to explain -- but the explanation only ever reached the Gallery
 * pane. Entries renders Drive-backed photos too and said nothing, so reading
 * an entry still meant bare placeholders and no way back.
 *
 * Nothing tested the Entries pane, which is why one of the two got it. This
 * covers both, so the next person who adds a third place to show a photo finds
 * out here rather than from somebody's empty gallery.
 *
 * It writes to the throwaway household through the ordinary REST API as the
 * QA account -- row-level security decides what it can reach, so it cannot
 * touch a real family -- and puts drive_links back exactly as it found it.
 */

const RUN = `E2E-DRIVE-${Date.now().toString(36)}`;
const BANNER = "Google Drive is no longer connected";

async function one<T>(qa: Rest, path: string): Promise<T | null> {
  const r = await qa.ctx.get(`${qa.url}/rest/v1/${path}`, { headers: qa.headers });
  expect(r.ok(), `reading ${path}: ${r.status()} ${await r.text()}`).toBeTruthy();
  const rows = (await r.json()) as T[];
  return rows[0] ?? null;
}

test("a dead Drive connection is explained on both journal panes", async ({ page }) => {
  const qa = await restAsQa();
  test.skip(!qa, "No Supabase details — see kin/e2e/README.md.");
  if (!qa) return;

  const me = await one<{ family_id: string; id: string }>(qa, "members?select=family_id,id&limit=1");
  expect(me, "the QA account is in a household").toBeTruthy();
  const familyId = me!.family_id;

  // Remember the real link row so this can be undone exactly.
  const before = await one<{ connected: boolean }>(
    qa,
    `drive_links?select=connected&family_id=eq.${familyId}`,
  );

  let mediaId: string | null = null;
  let entryId: string | null = null;

  try {
    // A Drive-backed photo, attached to an entry, with the link reporting dead.
    const m = await qa.ctx.post(`${qa.url}/rest/v1/journal_media`, {
      headers: { ...qa.headers, Prefer: "return=representation" },
      data: {
        family_id: familyId,
        media_type: "photo",
        storage_provider: "google_drive",
        drive_file_id: `${RUN}-file`,
        uploaded_by: me!.id,
      },
    });
    expect(m.ok(), `creating media: ${m.status()} ${await m.text()}`).toBeTruthy();
    mediaId = (await m.json())[0].id;

    const e = await qa.ctx.post(`${qa.url}/rest/v1/journal_entries`, {
      headers: { ...qa.headers, Prefer: "return=representation" },
      data: {
        family_id: familyId,
        entry_date: new Date().toISOString().slice(0, 10),
        title: `${RUN} entry`,
        source: "manual",
        created_by: me!.id,
      },
    });
    expect(e.ok(), `creating entry: ${e.status()} ${await e.text()}`).toBeTruthy();
    entryId = (await e.json())[0].id;

    const join = await qa.ctx.post(`${qa.url}/rest/v1/journal_entry_media`, {
      headers: qa.headers,
      data: { entry_id: entryId, media_id: mediaId, sort_order: 0 },
    });
    expect(join.ok(), `attaching media: ${join.status()} ${await join.text()}`).toBeTruthy();

    const dead = await qa.ctx.post(`${qa.url}/rest/v1/drive_links`, {
      headers: { ...qa.headers, Prefer: "resolution=merge-duplicates" },
      data: { family_id: familyId, connected: false, folder_path: "Kin" },
    });
    expect(dead.ok(), `marking the link dead: ${dead.status()} ${await dead.text()}`).toBeTruthy();

    // Both panes, same question, same answer.
    await page.goto("/journal?seg=gallery");
    await expect(page.getByText(BANNER)).toBeVisible();

    await page.goto("/journal?seg=entries");
    await expect(page.getByText(BANNER), "Entries shows Drive photos too, so it must explain them too").toBeVisible();

    // And it is the connection that decides, not merely having a Drive photo:
    // reconnected, the same pages must say nothing.
    const alive = await qa.ctx.post(`${qa.url}/rest/v1/drive_links`, {
      headers: { ...qa.headers, Prefer: "resolution=merge-duplicates" },
      data: { family_id: familyId, connected: true, folder_path: "Kin" },
    });
    expect(alive.ok(), `restoring the link: ${alive.status()} ${await alive.text()}`).toBeTruthy();

    await page.goto("/journal?seg=entries");
    await expect(page.getByText(BANNER)).toHaveCount(0);
    await page.goto("/journal?seg=gallery");
    await expect(page.getByText(BANNER)).toHaveCount(0);
  } finally {
    if (entryId) {
      await qa.ctx.delete(`${qa.url}/rest/v1/journal_entry_media?entry_id=eq.${entryId}`, { headers: qa.headers });
      await qa.ctx.delete(`${qa.url}/rest/v1/journal_entries?id=eq.${entryId}`, { headers: qa.headers });
    }
    if (mediaId) await qa.ctx.delete(`${qa.url}/rest/v1/journal_media?id=eq.${mediaId}`, { headers: qa.headers });
    // Exactly as found: restore the old value, or remove a row this test made.
    if (before) {
      await qa.ctx.post(`${qa.url}/rest/v1/drive_links`, {
        headers: { ...qa.headers, Prefer: "resolution=merge-duplicates" },
        data: { family_id: familyId, connected: before.connected, folder_path: "Kin" },
      });
    } else {
      await qa.ctx.delete(`${qa.url}/rest/v1/drive_links?family_id=eq.${familyId}`, { headers: qa.headers });
    }
    await qa.ctx.dispose();
  }
});
