import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { restAsQa } from "./support/qa-household";

/** The tree file, in a real browser, as the sample household (on Plus,
 * QA_HOUSEHOLDS.md). Import adds three made-up people
 * whose surname is this run's, checks they landed linked to each other and
 * that the export writes them back, then
 * deletes them again -- and proves they are gone. */

const RUN = `E2EGED${Date.now().toString(36)}`;

test("import previews, adds and links; export writes them back", async ({ page }) => {
  await page.goto("/family/tree-file");
  await expect(page.getByRole("heading", { name: "Tree file" })).toBeVisible();
  if (await page.getByText("is part of Kin Plus").isVisible()) {
    await expect(page.getByRole("button", { name: "Download the tree file" })).toHaveCount(0);
    return;
  }

  const qa = await restAsQa();
  test.skip(!qa, "No Supabase details -- see kin/e2e/README.md.");
  if (!qa) return;
  try {
    const sample = [
      "0 HEAD",
      "1 SOUR FamilySearch",
      "1 CHAR UTF-8",
      "0 @P1@ INDI",
      `1 NAME Pedro /${RUN}/`,
      "1 SEX M",
      "1 BIRT",
      "2 DATE ABT 1890",
      "1 DEAT Y",
      "0 @P2@ INDI",
      `1 NAME Rosa /${RUN}/`,
      "1 SEX F",
      "0 @P3@ INDI",
      `1 NAME Lito /${RUN}/`,
      "1 BIRT",
      "2 DATE 4 JUL 1921",
      "0 @F1@ FAM",
      "1 HUSB @P1@",
      "1 WIFE @P2@",
      "1 CHIL @P3@",
      "0 TRLR",
    ].join("\n");
    await page.locator('input[type="file"]').setInputFiles({ name: "sample.ged", mimeType: "text/plain", buffer: Buffer.from(sample) });
    await expect(page.getByText("3 to add, 0 already on your tree")).toBeVisible();
    await expect(page.getByText(`Lito ${RUN}`)).toBeVisible();
    await expect(page.getByText(`Child of Pedro ${RUN} and Rosa ${RUN}`)).toBeVisible();
    await page.getByRole("button", { name: "Add 3 people to the tree" }).click();
    await expect(page.getByText("Added 3 people to the tree")).toBeVisible();

    const r = await qa.ctx.get(`${qa.url}/rest/v1/family_tree_people?select=id,full_name,dob,notes,father_id,mother_id,spouse_id&full_name=like.*${RUN}`, { headers: qa.headers });
    const rows = (await r.json()) as { id: string; full_name: string; dob: string | null; notes: string | null; father_id: string | null; mother_id: string | null; spouse_id: string | null }[];
    const by = (first: string) => rows.find((x) => x.full_name.startsWith(first))!;
    expect(rows).toHaveLength(3);
    expect(by("Lito")).toMatchObject({ dob: "1921-07-04", father_id: by("Pedro").id, mother_id: by("Rosa").id });
    expect(by("Pedro")).toMatchObject({ spouse_id: by("Rosa").id, notes: "Born about 1890. Died." });
    expect(by("Rosa").spouse_id).toBe(by("Pedro").id);

    // Export: the three are in it. Lito (1921) may be alive, so a year only;
    // Pedro has a death, so he is written in full ("about 1890" is in his notes).
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download the tree file" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/family tree\.ged$/);
    const ged = fs.readFileSync(await file.path(), "utf8");
    expect(ged.startsWith("0 HEAD\r\n")).toBe(true);
    expect(ged.trimEnd().endsWith("0 TRLR")).toBe(true);
    expect(ged).toContain("2 VERS 5.5.1");
    expect(ged).toContain(`1 NAME Lito /${RUN}/\r\n1 BIRT\r\n2 DATE 1921\r\n`);
    expect(ged).not.toContain("4 JUL 1921");
    expect(ged).toContain(`1 NAME Pedro /${RUN}/\r\n1 SEX M\r\n1 DEAT Y\r\n1 NOTE Born about 1890. Died.`);

    // The same file again adds nobody: Lito by his birth date, then his
    // parents as his parents on the tree.
    await page.locator('input[type="file"]').setInputFiles({ name: "sample.ged", mimeType: "text/plain", buffer: Buffer.from(sample) });
    await expect(page.getByText("0 to add, 3 already on your tree")).toBeVisible();
    await expect(page.getByText("Already on your tree as")).toHaveCount(3);
  } finally {
    await qa.ctx.delete(`${qa.url}/rest/v1/family_tree_people?full_name=like.*${RUN}`, { headers: qa.headers });
    const left = await qa.ctx.get(`${qa.url}/rest/v1/family_tree_people?select=id&full_name=like.*${RUN}`, { headers: qa.headers });
    expect(await left.json(), "the people this run added are gone").toEqual([]);
    await qa.ctx.dispose();
  }
});
