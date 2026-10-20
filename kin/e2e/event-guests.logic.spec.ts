import { test, expect } from "@playwright/test";
import {
  GUEST_NAME_MAX,
  cleanGuestName,
  groupGuests,
  guestHeadsLabel,
  guestInviteMessage,
  guestLabel,
  guestLinkCanBeMade,
  guestLinkLive,
  guestNameKey,
  guestsLine,
  headsIn,
  isGuestState,
} from "@/lib/event-guests";

/** A guest link on an event (20261020231000_event_guest_links.sql): what a
 * name may be, how long the link lives, and how the household sees guests.
 * The database keeps the same rules (guest_clean_name, guest_link_live);
 * this is what the screens show. */

test("a name is trimmed and its spaces collapsed; markup and control characters are refused", () => {
  expect(cleanGuestName("  Tita   Baby ")).toBe("Tita Baby");
  expect(cleanGuestName("Lola Nena-Reyes")).toBe("Lola Nena-Reyes");
  expect(cleanGuestName("<b>Tita</b>")).toBeNull();
  expect(cleanGuestName("Tita\u0000Baby")).toBeNull();
  expect(cleanGuestName("   ")).toBeNull();
  expect(cleanGuestName(null)).toBeNull();
  expect(cleanGuestName("T".repeat(GUEST_NAME_MAX))).toHaveLength(GUEST_NAME_MAX);
  expect(cleanGuestName("T".repeat(GUEST_NAME_MAX + 1))).toBeNull();
});

test("the same person, however they typed it", () => {
  expect(guestNameKey("TITA  baby ")).toBe(guestNameKey("Tita Baby"));
  expect(guestNameKey("Tita Baby")).not.toBe(guestNameKey("Tita Babe"));
});

test("a link can be made on a one-off event through its last day, never on a yearly one", () => {
  const party = { event_date: "2026-12-20", end_date: null };
  expect(guestLinkCanBeMade(party, "2026-12-01")).toBe(true);
  expect(guestLinkCanBeMade(party, "2026-12-20")).toBe(true);
  expect(guestLinkCanBeMade(party, "2026-12-21")).toBe(false);
  expect(guestLinkCanBeMade({ event_date: "2026-12-20", end_date: "2026-12-22" }, "2026-12-22")).toBe(true);
  expect(guestLinkCanBeMade({ event_date: "1990-12-20", recurs_yearly: true }, "2026-12-01")).toBe(false);
});

test("the link opens for seven days after the event's last day, then not", () => {
  const party = { event_date: "2026-12-20", end_date: "2026-12-21" };
  expect(guestLinkLive(party, "2026-12-10")).toBe(true);
  expect(guestLinkLive(party, "2026-12-28")).toBe(true);
  expect(guestLinkLive(party, "2026-12-29")).toBe(false);
  // Across a year end.
  expect(guestLinkLive({ event_date: "2026-12-30" }, "2027-01-06")).toBe(true);
  expect(guestLinkLive({ event_date: "2026-12-30" }, "2027-01-07")).toBe(false);
  expect(guestLinkLive({ event_date: "2026-12-30", recurs_yearly: true }, "2026-12-30")).toBe(false);
});

test("the household sees guests by link, each with how many they are", () => {
  const guests = [
    { id: "1", name: "Tita Baby", answer: "going", headcount: 4 },
    { id: "2", name: "Kuya Jun", answer: "maybe", headcount: 2 },
    { id: "3", name: "Ate Weng", answer: "no", headcount: 3 },
    { id: "4", name: "Lolo Ben", answer: null, headcount: 1 },
  ];
  const g = groupGuests(guests);
  expect(g.going).toEqual([{ id: "1", name: "Tita Baby (by link)", heads: 4 }]);
  expect(g.maybe.map((p) => p.heads)).toEqual([2]);
  // Can't go counts as one, whatever the party would have been.
  expect(g.no).toEqual([{ id: "3", name: "Ate Weng (by link)", heads: 1 }]);
  expect(guestLabel("Lolo Ben")).toBe("Lolo Ben (by link)");
  expect(guestHeadsLabel("Tita Baby (by link)", 4)).toBe("Tita Baby (by link) ×4");
  expect(guestHeadsLabel("Kuya Jun (by link)", 1)).toBe("Kuya Jun (by link)");
});

test("Going counts heads: members one each, guests their party", () => {
  expect(headsIn([{ id: "a", name: "Ann" }, { id: "1", name: "Tita Baby (by link)", heads: 4 }])).toBe(5);
  expect(headsIn([])).toBe(0);
});

test("the host's line under the link", () => {
  expect(guestsLine([])).toBe("Nobody has answered by link yet");
  expect(
    guestsLine([
      { id: "1", name: "Tita Baby", answer: "going", headcount: 4 },
      { id: "2", name: "Kuya Jun", answer: "going", headcount: 1 },
      { id: "3", name: "Ate Weng", answer: "no", headcount: 1 },
      { id: "4", name: "Lolo Ben", answer: null, headcount: 1 },
    ]),
  ).toBe("4 by link · 5 going · 1 can't go");
});

test("the message beside the link names the event and the day and promises no app", () => {
  const m = guestInviteMessage("Christmas party", "Thursday 24 December 2026", "https://kin.example/guest/abc");
  expect(m).toContain("Christmas party, Thursday 24 December 2026");
  expect(m).toContain("no app needed");
  expect(m.endsWith("https://kin.example/guest/abc")).toBe(true);
});

test("a guest's own state is recognised, and anything else is not", () => {
  expect(isGuestState({ name: "Tita Baby", answer: "going", headcount: 4, claims: {}, dishes: 0, in_draw: false, pick: null })).toBe(true);
  expect(isGuestState(null)).toBe(false);
  expect(isGuestState({ name: "x" })).toBe(false);
});
