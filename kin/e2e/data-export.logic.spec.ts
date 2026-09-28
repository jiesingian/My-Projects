import { test, expect } from "@playwright/test";
import { buildZip, crc32 } from "@/lib/export/zip";
import { toCsv, withoutSecrets } from "@/lib/export/csv";

/** "Download my data" (actions/export.ts) writes its own ZIP rather than
 * pulling in a library, so the pieces a family's file depends on are pinned
 * here: the checksum every unzip verifies, the archive's structure, CSV that
 * spreadsheets read, and the columns that must never leave Kin. */

test("crc32 is the standard one", () => {
  // The check value from the CRC-32 specification.
  expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
});

test("the zip has one entry per file, UTF-8 names, and a well-formed end", () => {
  const enc = new TextEncoder();
  const zip = buildZip([
    { name: "README.txt", data: enc.encode("hello") },
    { name: "people ₱.csv", data: enc.encode("a,b\r\n") },
  ]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  expect(view.getUint32(0, true)).toBe(0x04034b50); // first local header
  const end = zip.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50); // end of central directory
  expect(view.getUint16(end + 10, true)).toBe(2); // entries
  const centralStart = view.getUint32(end + 16, true);
  expect(view.getUint32(centralStart, true)).toBe(0x02014b50);
  expect(view.getUint16(centralStart + 8, true) & 0x0800).toBe(0x0800); // UTF-8 names
});

test("csv quotes what needs quoting and opens as UTF-8", () => {
  const csv = toCsv([{ name: 'Niño, "Jr"', amount: 149 }, { name: "Lola", note: "line one\nline two" }]);
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain('"Niño, ""Jr"""');
  expect(csv).toContain('"line one\nline two"');
  expect(csv.split("\r\n")[0]).toBe("﻿name,amount,note");
});

test("a note cannot become a spreadsheet formula", () => {
  expect(toCsv([{ note: "=HYPERLINK(\"x\")" }])).toContain("'=HYPERLINK");
  expect(toCsv([{ note: "+639170000000" }])).toContain("'+639170000000");
});

test("vault secrets, tokens, hashes and billing ids are withheld", () => {
  const [row] = withoutSecrets([
    { label: "Wi-Fi", username: "home", secret: "hunter2", pin_hash: "x", calendar_feed_hash: "y", brief_hash: "z", invite_code: "A7K2QD", billing_customer_id: "c", auth_user_id: "u", access_token: "t", pinned: true },
  ]);
  expect(Object.keys(row).sort()).toEqual(["label", "pinned", "username"]);
});
