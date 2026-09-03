import { createAdminClient } from "@/lib/supabase/admin";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

/** Reads the household's stored Calendar token, refreshing it first if it's
 * expired. Returns null if Calendar isn't connected or refresh fails —
 * callers should just skip the sync in that case, never throw. Mirrors
 * getValidDriveAccessToken() in google-drive.ts — kept as a separate token
 * store since a household can connect Drive and Calendar independently. */
export async function getValidCalendarAccessToken(familyId: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: token } = await admin.from("calendar_tokens").select("*").eq("family_id", familyId).maybeSingle();
  if (!token) return null;

  const expiresAt = token.token_expires_at ? new Date(token.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return token.access_token;

  if (!token.refresh_token) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const refreshed = (await res.json()) as { access_token: string; expires_in: number };

  await admin
    .from("calendar_tokens")
    .update({
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("family_id", familyId);

  return refreshed.access_token;
}

async function calendarFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
}

export type CalendarEventInput = {
  title: string;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  location?: string | null;
};

function toGoogleEventBody(input: CalendarEventInput) {
  const end = input.endAt ?? new Date(input.startAt.getTime() + 60 * 60 * 1000);
  if (input.allDay) {
    const startDate = input.startAt.toISOString().slice(0, 10);
    const endExclusive = new Date(input.startAt.getTime() + 86_400_000).toISOString().slice(0, 10);
    return { summary: input.title, location: input.location ?? undefined, start: { date: startDate }, end: { date: endExclusive } };
  }
  return {
    summary: input.title,
    location: input.location ?? undefined,
    start: { dateTime: input.startAt.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

/** Creates a new event on the household's connected Google Calendar. */
export async function createCalendarEvent(accessToken: string, calendarId: string, input: CalendarEventInput): Promise<string> {
  const res = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEventBody(input)),
  });
  if (!res.ok) throw new Error(`Calendar event creation failed: ${res.status} ${await res.text()}`);
  const created = (await res.json()) as { id: string };
  return created.id;
}

/** Updates an event this app previously created. */
export async function updateCalendarEvent(accessToken: string, calendarId: string, eventId: string, input: CalendarEventInput): Promise<void> {
  const res = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleEventBody(input)),
  });
  if (!res.ok) throw new Error(`Calendar event update failed: ${res.status} ${await res.text()}`);
}

/** Deletes an event. Treats "already gone" (404/410) as success, since that
 * just means someone deleted it on the Google side already. */
export async function deleteCalendarEvent(accessToken: string, calendarId: string, eventId: string): Promise<boolean> {
  const res = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, { method: "DELETE" });
  return res.ok || res.status === 404 || res.status === 410;
}

export type GoogleCalendarEvent = {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

/** Lists events changed since the last sync (via Google's incremental sync
 * token), or does an initial sync of everything from today onward if there
 * is no token yet. When Google reports the token itself as invalid (410 —
 * happens occasionally, e.g. after a long gap), tells the caller to drop it
 * and start over rather than throwing. */
export async function listChangedCalendarEvents(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null; tokenInvalid?: boolean }> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ maxResults: "250", showDeleted: "true", singleEvents: "true" });
    if (syncToken) params.set("syncToken", syncToken);
    else params.set("timeMin", new Date().toISOString());
    if (pageToken) params.set("pageToken", pageToken);

    const res = await calendarFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
    if (res.status === 410) return { events: [], nextSyncToken: null, tokenInvalid: true };
    if (!res.ok) throw new Error(`Calendar list failed: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as { items: GoogleCalendarEvent[]; nextPageToken?: string; nextSyncToken?: string };
    events.push(...data.items);
    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}
