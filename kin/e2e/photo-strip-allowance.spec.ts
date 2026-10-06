import { test, expect } from "@playwright/test";

/** Event and visit photos are asked for at /api/uploads/session.
 *
 * Until 6 October the photo strip on an event or a doctor's visit put files
 * straight into Storage from the phone, so they were never held to the
 * household's Free or Plus allowance (family_storage_bytes counted them, but
 * nothing ever refused one). Now they ask for an upload slip like the journal
 * and the chat do, and the slip says where the file goes -- under the
 * household's folder for that event or visit, which is what
 * addEventPhotoAction and addVisitPhotoAction accept.
 *
 * It only asks for slips; nothing is uploaded or written.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

for (const [kind, folder] of [["event_photo", "events"], ["visit_photo", "health"]] as const) {
  test(`${kind}: a counted slip under the household's ${folder} folder`, async ({ page }) => {
    const owner = crypto.randomUUID();
    const res = await page.request.post("/api/uploads/session", {
      data: { kind, fileName: "IMG 0001.HEIC", mimeType: "image/heic", fileSize: 2_000_000, folderId: owner },
    });
    // 413 means the QA household is over its allowance, which is the check
    // working; anything else is a failure.
    if (res.status() === 413) return;
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("supabase");
    expect(body.bucket).toBe("journal");
    expect(body.path).toMatch(new RegExp(`^${UUID}/${folder}/${owner}/${UUID}\\.heic$`));
  });

  test(`${kind}: refused without a real id, or for something that isn't a photo`, async ({ page }) => {
    const noId = await page.request.post("/api/uploads/session", {
      data: { kind, fileName: "a.jpg", mimeType: "image/jpeg", fileSize: 1000, folderId: "../chat" },
    });
    expect(noId.status()).toBe(400);
    const notPhoto = await page.request.post("/api/uploads/session", {
      data: { kind, fileName: "a.pdf", mimeType: "application/pdf", fileSize: 1000, folderId: crypto.randomUUID() },
    });
    expect(notPhoto.status()).toBe(400);
  });
}
