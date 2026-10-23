import { test, expect } from "@playwright/test";
import { cardRows, documentRows, failedMessageRows, giftDrawSoon, occasionRows, threadHref, vaultRequestRows } from "@/lib/today-family";

/** The rest of the household on Today (23 October). Friday 23 October 2026. */
const today = "2026-10-23";

test("documents: expired within a month and expiring today are today's; a passport is heard of a month ahead, the rest a week", () => {
  const { today: rows, soon } = documentRows(
    [
      { id: "a", title: "Kaia's passport", doc_type: "Passport", expires_at: "2026-11-16T00:00:00Z", folder_id: "f1" }, // 24 days
      { id: "b", title: "Car insurance", doc_type: "Insurance", expires_at: "2026-10-27T00:00:00Z", folder_id: "f2" }, // 4 days
      { id: "c", title: "Driver's licence", doc_type: "Licence", expires_at: "2026-10-23T00:00:00Z", folder_id: null },
      { id: "d", title: "Old visa", doc_type: null, expires_at: "2026-10-20T00:00:00Z", folder_id: "f3" },
      { id: "e", title: "Long gone", doc_type: null, expires_at: "2026-01-01T00:00:00Z", folder_id: "f3" },
      { id: "f", title: "Not a passport", doc_type: "ID", expires_at: "2026-11-16T00:00:00Z", folder_id: "f1" },
    ],
    today,
  );
  expect(rows.map((r) => [r.id, r.meta, r.href, r.urgent])).toEqual([
    ["doc-c", "expires today · renew it", "/family?seg=documents", true],
    ["doc-d", "expired 3 days ago · renew it", "/family/documents/f3", true],
  ]);
  expect(soon.map((r) => [r.id, r.meta, r.at])).toEqual([
    ["soon-doc-a", "expires in 24 days · renew it", 24],
    ["soon-doc-b", "expires on Tuesday · renew it", 4],
  ]);
});

test("a card waits for the reader's signature; one already signed does not", () => {
  const rows = cardRows(
    [
      { recipientMemberId: "m1", recipientName: "Lola Rosa", opensOn: "2026-10-25", occasion: "birthday", signers: ["Jonathan", "Erynne"], signedByMe: false },
      { recipientMemberId: "m2", recipientName: "Kuya Ben", opensOn: "2026-12-25", occasion: "Christmas", signers: [], signedByMe: true },
    ],
    today,
  );
  expect(rows.map((r) => [r.id, r.title, r.meta])).toEqual([["card-m1-2026-10-25", "Sign Lola Rosa's card", "birthday · opens on Sunday · 2 signed"]]);
});

test("a failed scheduled message opens its thread", () => {
  const rows = failedMessageRows([{ id: "s1", body: "  Happy birthday Lola!\nSee you at 6  ", thread: "dm:11111111-1111-1111-1111-111111111111", send_at: "2026-10-23T01:00:00Z" }]);
  expect(rows[0].meta).toBe("“Happy birthday Lola! See you at 6” · send it again");
  expect(rows[0].href).toBe("/chat/dm/11111111-1111-1111-1111-111111111111");
  expect(threadHref("household")).toBe("/chat/household");
  expect(threadHref("group:22222222-2222-2222-2222-222222222222")).toBe("/chat/groups/22222222-2222-2222-2222-222222222222");
  expect(threadHref("odd")).toBe("/chat");
});

test("a vault request waiting on the grown-ups; answered ones are not", () => {
  const rows = vaultRequestRows([
    { id: "v1", memberName: "Tita Mel", reason: "Lola is in hospital", status: "waiting", waitDays: 2 },
    { id: "v2", memberName: "Kuya Ben", reason: null, status: "denied", waitDays: 2 },
  ]);
  expect(rows.map((r) => [r.id, r.title, r.meta, r.href])).toEqual([["vault-v1", "Tita Mel asks for the vault", "Lola is in hospital · opens by itself in 2 days unless answered · answer in Privacy & lock", "/settings/privacy"]]);
});

test("a linked household's birthday today; the exchange day of a monito-monita this week", () => {
  const rows = occasionRows([
    { eventId: "e1", title: "Lola Rosa", kind: "birthday", years: 72, householdName: "Santos", isOurs: false, milestone: false, greetings: [] },
    { eventId: "e2", title: "Us", kind: "anniversary", years: 10, householdName: "Singian", isOurs: true, milestone: false, greetings: [] },
  ]);
  expect(rows.map((r) => [r.id, r.meta])).toEqual([["occasion-e1", "Turns 72 today · Santos household"]]);
  const soon = giftDrawSoon([{ id: "d1", title: "Office", exchange_date: "2026-10-30" }, { id: "d2", title: "Clan", exchange_date: "2026-12-24" }], today);
  expect(soon.map((r) => [r.id, r.meta, r.at])).toEqual([["soon-draw-d1", "Exchange on Friday · got your gift?", 7]]);
});
