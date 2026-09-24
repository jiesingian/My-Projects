/** A calendar feed in iCalendar (RFC 5545) form, for Apple Calendar, Outlook
 * and anything else that subscribes to a link. Pure, so it is tested alone
 * (e2e/ics.logic.spec.ts). */

export type FeedRow = {
  uid: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  all_day: string | null;
  all_day_end: string | null;
  yearly: boolean;
  repeat: string | null;
  location: string | null;
  notes: string | null;
};

/** Commas, semicolons, backslashes and newlines are syntax in iCalendar. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded: CRLF then a space. Counted in
 * UTF-8 bytes, and never splitting a character. */
export function icsFold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function day(d: string): string {
  return d.replace(/-/g, "");
}

function nextDay(d: string): string {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10).replace(/-/g, "");
}

const RRULE: Record<string, string> = { weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY" };

export function buildIcs(calendarName: string, rows: FeedRow[], now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kin//Family calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Manila",
    // Ask subscribers to check back hourly; Apple honours this loosely.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const dtstamp = stamp(now.toISOString());
  for (const r of rows) {
    const ev = ["BEGIN:VEVENT", `UID:${r.uid}@kin`, `DTSTAMP:${dtstamp}`, `SUMMARY:${icsEscape(r.title)}`];
    if (r.all_day) {
      ev.push(`DTSTART;VALUE=DATE:${day(r.all_day)}`, `DTEND;VALUE=DATE:${nextDay(r.all_day_end && r.all_day_end >= r.all_day ? r.all_day_end : r.all_day)}`);
      if (r.yearly) ev.push("RRULE:FREQ=YEARLY");
    } else if (r.starts_at) {
      const end = r.ends_at && r.ends_at > r.starts_at ? r.ends_at : new Date(Date.parse(r.starts_at) + 3600_000).toISOString();
      ev.push(`DTSTART:${stamp(r.starts_at)}`, `DTEND:${stamp(end)}`);
      if (r.repeat && RRULE[r.repeat]) ev.push(`RRULE:${RRULE[r.repeat]}`);
    } else {
      continue;
    }
    if (r.location) ev.push(`LOCATION:${icsEscape(r.location)}`);
    if (r.notes) ev.push(`DESCRIPTION:${icsEscape(r.notes)}`);
    ev.push("END:VEVENT");
    lines.push(...ev);
  }
  lines.push("END:VCALENDAR");
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
