import { test, expect } from "@playwright/test";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listChangedCalendarEvents,
} from "@/lib/google-calendar";

/** The requests we make of Google, and what we do with the replies.
 *
 * There is no OAuth here and there cannot be: a real round trip needs
 * credentials the suite does not have, and giving CI a live Google account is
 * a decision with a bill attached. So `fetch` is replaced and every call is
 * inspected. That draws a hard line around what this proves -- the request we
 * build, and how we read a reply -- and what it does not: that Google accepts
 * the request. Anything that turns on Google's own behaviour is still only as
 * good as the shapes assumed below.
 *
 * It is still worth having. Every one of these is a decision the code makes on
 * its own: which URL, whether the token is attached, whether "already gone"
 * counts as deleted, whether an expired sync token throws or is handled. Those
 * were unexercised by anything at all. */

type Call = { url: string; init: RequestInit };

/** Swaps in a fetch that answers from a queue and records what it was asked.
 * Returns the record, and restores the real fetch afterwards. */
function stubFetch(replies: Array<{ status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const reply = replies[i++] ?? { status: 500 };
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.body,
      text: async () => JSON.stringify(reply.body ?? ""),
    } as Response;
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real) };
}

const TOKEN = "test-access-token";

test.describe("creating and updating an event", () => {
  test("posts the event to the member's own calendar, with the token attached", async () => {
    const f = stubFetch([{ body: { id: "google-event-1" } }]);
    try {
      const id = await createCalendarEvent(TOKEN, "primary", {
        title: "Erynne's birthday",
        startAt: new Date("2026-09-08T16:00:00.000Z"),
        allDay: true,
      });

      expect(id).toBe("google-event-1");
      expect(f.calls).toHaveLength(1);
      expect(f.calls[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      expect(f.calls[0].init.method).toBe("POST");
      expect(
        (f.calls[0].init.headers as Record<string, string>).Authorization,
        "without this Google would answer 401 and the sync would look like an app bug",
      ).toBe(`Bearer ${TOKEN}`);
      expect(JSON.parse(String(f.calls[0].init.body))).toMatchObject({
        summary: "Erynne's birthday",
        start: { date: "2026-09-09" },
        end: { date: "2026-09-10" },
      });
    } finally {
      f.restore();
    }
  });

  /** A member may nominate a calendar other than their default, and its id is
   * an address -- it must survive the URL intact. */
  test("a calendar id that looks like an address is escaped", async () => {
    const f = stubFetch([{ body: { id: "x" } }]);
    try {
      await createCalendarEvent(TOKEN, "jonathan@example.com", { title: "x", startAt: new Date("2026-09-09T01:00:00Z") });
      expect(f.calls[0].url).toContain("/calendars/jonathan%40example.com/events");
    } finally {
      f.restore();
    }
  });

  test("a refusal is raised rather than swallowed", async () => {
    const f = stubFetch([{ status: 403, body: { error: "insufficientPermissions" } }]);
    try {
      await expect(
        createCalendarEvent(TOKEN, "primary", { title: "x", startAt: new Date("2026-09-09T01:00:00Z") }),
        "a failed create must not return quietly, or the row is linked to an event that does not exist",
      ).rejects.toThrow(/403/);
    } finally {
      f.restore();
    }
  });

  test("an update patches the existing event rather than making another", async () => {
    const f = stubFetch([{ status: 200, body: {} }]);
    try {
      await updateCalendarEvent(TOKEN, "primary", "google-event-1", {
        title: "Erynne's birthday party",
        startAt: new Date("2026-09-08T16:00:00.000Z"),
        allDay: true,
      });
      expect(f.calls[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/google-event-1");
      expect(f.calls[0].init.method).toBe("PATCH");
    } finally {
      f.restore();
    }
  });
});

test.describe("deleting an event", () => {
  /** Someone deleting it on their phone first is the ordinary case, not an
   * error. Treating 404 as a failure would strand the link row and the app
   * would try again forever. */
  test("already gone counts as deleted", async () => {
    for (const status of [200, 204, 404, 410]) {
      const f = stubFetch([{ status }]);
      try {
        expect(await deleteCalendarEvent(TOKEN, "primary", "e1"), `${status} should count as deleted`).toBe(true);
      } finally {
        f.restore();
      }
    }
  });

  test("a real failure is reported as one", async () => {
    const f = stubFetch([{ status: 500 }]);
    try {
      expect(await deleteCalendarEvent(TOKEN, "primary", "e1")).toBe(false);
    } finally {
      f.restore();
    }
  });
});

test.describe("listing what changed", () => {
  test("the first sync asks from now onward, not for everything ever", async () => {
    const f = stubFetch([{ body: { items: [], nextSyncToken: "tok-1" } }]);
    try {
      const out = await listChangedCalendarEvents(TOKEN, "primary", null);
      expect(out.nextSyncToken).toBe("tok-1");
      expect(f.calls[0].url).toContain("timeMin=");
      expect(f.calls[0].url, "a first sync must not carry a sync token").not.toContain("syncToken=");
      expect(f.calls[0].url).toContain("showDeleted=true");
    } finally {
      f.restore();
    }
  });

  test("later syncs ask only for what changed", async () => {
    const f = stubFetch([{ body: { items: [], nextSyncToken: "tok-2" } }]);
    try {
      await listChangedCalendarEvents(TOKEN, "primary", "tok-1");
      expect(f.calls[0].url).toContain("syncToken=tok-1");
      expect(f.calls[0].url, "asking for a time range as well would defeat the token").not.toContain("timeMin=");
    } finally {
      f.restore();
    }
  });

  test("every page is collected, not just the first", async () => {
    const f = stubFetch([
      { body: { items: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" } },
      { body: { items: [{ id: "c" }], nextSyncToken: "tok-3" } },
    ]);
    try {
      const out = await listChangedCalendarEvents(TOKEN, "primary", "tok-1");
      expect(out.events.map((e) => e.id), "a second page of changes was dropped").toEqual(["a", "b", "c"]);
      expect(out.nextSyncToken).toBe("tok-3");
      expect(f.calls[1].url).toContain("pageToken=p2");
    } finally {
      f.restore();
    }
  });

  /** Google expires a sync token after a long gap. That is a routine event,
   * not a failure -- the caller drops the token and starts over. Throwing here
   * would break every later sync for that member until someone noticed. */
  test("an expired sync token is handled, not thrown", async () => {
    const f = stubFetch([{ status: 410 }]);
    try {
      const out = await listChangedCalendarEvents(TOKEN, "primary", "stale-token");
      expect(out.tokenInvalid).toBe(true);
      expect(out.nextSyncToken).toBeNull();
      expect(out.events).toEqual([]);
    } finally {
      f.restore();
    }
  });

  test("any other failure is raised", async () => {
    const f = stubFetch([{ status: 500, body: { error: "backendError" } }]);
    try {
      await expect(listChangedCalendarEvents(TOKEN, "primary", "tok-1")).rejects.toThrow(/500/);
    } finally {
      f.restore();
    }
  });
});
