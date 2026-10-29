"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icons";
import { createEventGuestLinkAction, removeEventGuestAction, revokeEventGuestLinkAction, setEventGuestLinkDrawAction } from "@/lib/actions/event-guests";
import { guestHeadsLabel, guestInviteMessage, guestLabel, guestsLine, likelySameGuests, type GuestRow } from "@/lib/event-guests";

/** The guest link on an event's own screen (20261020231000): a grown-up of
 * the host household makes it, shares it, points it at one of the
 * household's monito-monita draws, and turns it off; and sees who answered
 * by link, with a way to take one off. The link is shown once, when made. */
export function EventGuestLink({
  eventId,
  eventTitle,
  when,
  link,
  draws,
  guests,
  canMake,
  canChange,
}: {
  eventId: string;
  eventTitle: string;
  /** The event's day in words, for the message beside the link. */
  when: string;
  /** The link on this event, or null when there is none. */
  link: { drawId: string | null; createdAt: string; lastUsedAt: string | null } | null;
  /** The household's own draws not yet drawn, for "guests may join". */
  draws: { id: string; title: string }[];
  guests: GuestRow[];
  /** A grown-up of the host household, on an event not yet over. */
  canMake: boolean;
  /** A grown-up of the host household: may take guests off and turn the link off. */
  canChange: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [drawId, setDrawId] = useState<string>(link?.drawId ?? "");
  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else after?.();
      router.refresh();
    });
  const make = () =>
    start(async () => {
      const r = await createEventGuestLinkAction(eventId, drawId || null);
      if (r.error) toast.error(r.error);
      else if (r.url) setUrl(r.url);
      router.refresh();
    });
  const message = url ? guestInviteMessage(eventTitle, when, url) : "";
  const share = async () => {
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: eventTitle, text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      toast.success("Copied. Paste it into a message.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error("Couldn't share from this browser.");
    }
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  const small: React.CSSProperties = { fontSize: "0.8125rem", color: "var(--color-neutral-600)" };
  const twins = likelySameGuests(guests);
  const btn: React.CSSProperties = { minHeight: "2.25rem", fontSize: "0.84375rem" };

  return (
    <div>
      <p style={{ ...small, margin: "0 0 0.5rem" }}>
        {link
          ? "Relatives with the link answer by name: who's coming and how many, what they'll bring. They see this event's name, date and list only."
          : "For relatives who aren't on Kin: they open the link, type their name, and say if they're coming and what they'll bring. They see this event's name, date and list, nothing else."}
      </p>

      {url && (
        <div style={{ marginBottom: "0.625rem" }}>
          <p style={{ fontSize: "0.84375rem", margin: "0 0 0.375rem" }}>
            <b>Your guest link.</b> Share it now: Kin shows it only once. Anyone with it can answer for this event, so send it to the relatives you mean, and make a new one if it gets passed around.
          </p>
          <p style={{ ...small, margin: "0 0 0.375rem", padding: "0.5rem 0.625rem", borderRadius: 10, background: "color-mix(in srgb, var(--color-text) 6%, transparent)", wordBreak: "break-all" }}>{message}</p>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" style={btn} onClick={() => void share()}>
              <Icon name="upload" size={13} /> Share
            </button>
            <button type="button" className="btn btn-secondary" style={btn} onClick={() => void copy()}>
              <Icon name="copy" size={13} /> Copy link
            </button>
          </div>
        </div>
      )}

      {canMake && (
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
          {!url && (
            <button type="button" className={link ? "btn btn-secondary" : "btn btn-primary"} style={btn} disabled={pending} onClick={make}>
              {link ? "Make a new link" : "Make a guest link"}
            </button>
          )}
          {link && canChange && (
            <button type="button" className="btn btn-ghost" style={btn} disabled={pending} onClick={() => run(() => revokeEventGuestLinkAction(eventId), () => setUrl(null))}>
              Turn the link off
            </button>
          )}
        </div>
      )}
      {link && !canMake && canChange && (
        <button type="button" className="btn btn-ghost" style={btn} disabled={pending} onClick={() => run(() => revokeEventGuestLinkAction(eventId))}>
          Turn the link off
        </button>
      )}

      {(canMake || link) && draws.length > 0 && (
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.84375rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
          <span>Guests may join the draw:</span>
          <select
            className="input"
            aria-label="Which gift exchange draw guests may join"
            style={{ minHeight: "2.25rem", fontSize: "0.84375rem", flex: "1 1 10rem", minWidth: 0 }}
            value={drawId}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value;
              setDrawId(next);
              if (link) run(() => setEventGuestLinkDrawAction(eventId, next || null));
            }}
          >
            <option value="">None</option>
            {draws.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {link && (
        <div style={{ ...small, marginTop: "0.625rem" }}>
          {guestsLine(guests)}
          {link.lastUsedAt ? "" : " · not opened yet"}
        </div>
      )}
      {guests.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0.375rem 0 0", padding: 0 }}>
          {/* A relative who answered twice under two spellings (29 October). */}
          {guests.map((g) => (
            <li key={g.id} className="kin-potluck-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.9375rem", fontWeight: 500 }}>{guestHeadsLabel(guestLabel(g.name), g.answer && g.answer !== "no" ? g.headcount : 1)}</div>
                <div style={small}>{g.answer === "going" ? "Going" : g.answer === "maybe" ? "Maybe" : g.answer === "no" ? "Can't go" : "Hasn't said yet"}</div>
                {twins.has(g.id) && (
                  <div style={{ ...small, color: "var(--cal-money-ink)" }}>
                    Same person as {twins.get(g.id)}?{canChange ? " Take one off with ×." : ""}
                  </div>
                )}
              </div>
              {canChange && (
                <button type="button" className="kin-potluck-remove" aria-label={`Take ${g.name} off`} disabled={pending} onClick={() => run(() => removeEventGuestAction(g.id))}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
