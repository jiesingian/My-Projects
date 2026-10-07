"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { confirm } from "@/components/confirm-sheet";
import {
  setLocationSharingAction,
  reportMyLocationAction,
  pauseMyLocationAction,
  setChildLocationOkAction,
  addPlaceAction,
  setPlaceNotifyAction,
  removePlaceAction,
} from "@/lib/actions/location";
import { isPaused, type SavedPlace } from "@/lib/location-places";
import { isGrownUp } from "@/lib/roles";
import type { MemberLocation } from "@/lib/queries/family";

/** Where everyone is, for the households that want that, and off for the
 * ones that do not.
 *
 * Two things this deliberately is not. It is not a trail -- one row per
 * person, overwritten, so there is no history of where a teenager has been.
 * And it is not background tracking: a browser cannot report a position
 * while it is closed, on iOS especially, so this updates when the person has
 * Kin open and says so on the card rather than implying a watchfulness it
 * does not have. */
export function LocationBoard({ people, meId, myRole, places }: { people: MemberLocation[]; meId: string; myRole: string; places: SavedPlace[] }) {
  const me = people.find((p) => p.memberId === meId);
  const grownUp = isGrownUp(myRole);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {me?.sharing && !isPaused(me.pausedUntil) && <Reporter />}
      {people.map((p) => (
        <PersonRow key={p.memberId} person={p} isMe={p.memberId === meId} canManage={grownUp} />
      ))}
      <Places places={places} canManage={grownUp} />
      {/* The privacy promise, in plain words, next to the switch (item 10). */}
      <p style={{ fontSize: "0.75rem", lineHeight: 1.5, color: "var(--color-neutral-600)", margin: "2px 0 0" }}>
        <b>How this works.</b> Nobody is shown until they switch it on for themselves, and you can pause or stop with
        one tap. Only the people in your household can see it — never anyone else, and it is never sold or shared. Kin
        keeps only your latest spot, not a trail, and deletes it the moment you stop. It updates while you have Kin
        open. A child with their own login can share only after a parent says yes.
      </p>
    </div>
  );
}

/** Asks the browser once per visit, and again every couple of minutes while
 * the tab is actually in front of somebody. A tab left open behind another
 * window is not a person walking around, and polling it is a battery cost
 * with nothing on the other end. */
function Reporter() {
  const router = useRouter();
  const sent = useRef(false);

  const report = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const result = await reportMyLocationAction(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null);
        if (!result.error && !sent.current) {
          sent.current = true;
          router.refresh();
        }
      },
      // A refused or unavailable position is an ordinary outcome, not an
      // error worth shouting about -- the row simply stays as it was.
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
    );
  }, [router]);

  useEffect(() => {
    report();
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") report();
    }, 120_000);
    return () => clearInterval(tick);
  }, [report]);

  return null;
}

function PersonRow({ person, isMe, canManage }: { person: MemberLocation; isMe: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Whose switch this is. Your own, always; a managed child's, if you are a
  // grown-up, because that profile has nobody to press it for itself.
  const mine = isMe || (canManage && person.role === "child_managed");

  const toggle = (on: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await setLocationSharingAction(person.memberId, on);
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  const paused = person.sharing && isPaused(person.pausedUntil);
  const hasFix = person.sharing && !paused && person.lat !== null && person.lng !== null;
  // A child with their own login needs a grown-up's yes before their own
  // Share button does anything (20261007160000).
  const needsOk = isMe && person.role === "child_self" && !person.parentOk;

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <Blueprint style={{ padding: "0.6875rem 0.75rem", display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
      <span
        style={{
          width: 30,
          height: 30,
          flex: "none",
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: hasFix ? "color-mix(in srgb, var(--color-accent) 20%, transparent)" : "var(--color-surface-sunken, transparent)",
          border: hasFix ? "none" : "1px solid var(--color-divider)",
        }}
      >
        <Icon name="mapPin" size={16} style={{ color: hasFix ? "var(--color-accent-700)" : "var(--color-neutral-500)" }} />
      </span>

      <span style={{ flex: 1, minWidth: 120 }}>
        <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 500 }}>
          {person.name.split(" ")[0]}
          {isMe ? " (you)" : ""}
        </span>
        <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {!person.sharing
            ? person.role === "child_self"
              ? person.parentOk
                ? "Not sharing · a parent has said yes"
                : "Not sharing · needs a parent's yes first"
              : "Not sharing"
            : paused
              ? `Paused until ${untilLabel(person.pausedUntil!)}`
              : hasFix
              ? `${person.placeName ? `At ${person.placeName} · ` : ""}${sinceLabel(person.updatedAt)}${person.accuracyM !== null ? ` · ${accuracyLabel(person.accuracyM)}` : ""}`
              : person.role === "child_managed"
                ? "Sharing on — this profile has no device of its own"
                : "Sharing on — waiting for their first reading"}
        </span>
      </span>

      {hasFix && (
        <a
          className="btn btn-secondary"
          href={`https://www.google.com/maps/search/?api=1&query=${person.lat},${person.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.625rem" }}
        >
          Map
        </a>
      )}

      {isMe && person.sharing && (
        paused ? (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => pauseMyLocationAction(null))} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.625rem" }}>
            Resume
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => pauseMyLocationAction(1))} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}>
              Pause 1 hr
            </button>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => pauseMyLocationAction("tomorrow"))} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}>
              Till tomorrow
            </button>
          </>
        )
      )}

      {!isMe && canManage && person.role === "child_self" && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={async () => {
            const first = person.name.split(" ")[0];
            if (!person.parentOk) {
              if (!(await confirm({ title: `Let ${first} share their location?`, description: `${first} still chooses whether to turn it on, and can pause or stop at any time. You can take this back whenever you like.`, confirmLabel: "Allow" }))) return;
              run(() => setChildLocationOkAction(person.memberId, true));
            } else {
              if (!(await confirm({ title: `Stop ${first} sharing?`, description: "Their sharing switches off and their last spot is deleted.", confirmLabel: "Stop it", danger: true }))) return;
              run(() => setChildLocationOkAction(person.memberId, false));
            }
          }}
          style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.625rem" }}
        >
          {person.parentOk ? "Withdraw yes" : "Allow"}
        </button>
      )}

      {mine && !needsOk && (
        <button
          type="button"
          className={person.sharing ? "btn btn-ghost" : "btn btn-secondary"}
          disabled={pending}
          onClick={async () => {
            if (person.sharing) {
              toggle(false);
              return;
            }
            const who = isMe ? "your location" : `${person.name.split(" ")[0]}'s location`;
            if (
              !(await confirm({
                title: `Share ${who} with the household?`,
                description: "Only the people in your household will see where this is, updated while Kin is open. You can pause or stop at any time, and stopping deletes it.",
                confirmLabel: "Start sharing",
              }))
            )
              return;
            toggle(true);
          }}
          style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.625rem" }}
        >
          {person.sharing ? "Stop" : "Share"}
        </button>
      )}

      {error && <div style={{ flexBasis: "100%", fontSize: "0.75rem", color: "var(--cal-occasion)" }}>{error}</div>}
    </Blueprint>
  );
}

function sinceLabel(iso: string | null): string {
  if (!iso) return "Just now";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "Within 12 m" and "within 3 km" are different answers to the same
 * question, and a pin that does not say which is quietly lying. */
function accuracyLabel(m: number): string {
  return m >= 1000 ? `within ${Math.round(m / 100) / 10} km` : `within ${Math.round(m)} m`;
}

/** "3:40 pm", or "tomorrow 7:00 am" for a pause that runs past midnight. */
function untilLabel(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }).toLowerCase();
  return at.toDateString() === new Date().toDateString() ? time : `tomorrow ${time}`;
}

const PLACE_NAMES = ["Home", "School", "Work"] as const;

/** The household's saved places: a grown-up saves one from where they are
 * standing, and chooses whether arriving there sends a notice. */
function Places({ places, canManage }: { places: SavedPlace[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string>("Home");
  const [custom, setCustom] = useState("");
  if (!canManage && places.length === 0) return null;

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  const saveHere = () => {
    const label = name === "Other" ? custom.trim() : name;
    if (!label) {
      setError("Name the place.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser can't read where you are.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => run(() => addPlaceAction({ name: label, lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => setError("Kin couldn't read where you are. Check that location is allowed for Kin."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <Blueprint style={{ padding: "0.75rem" }}>
      <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>Saved places</div>
      {places.length === 0 && (
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>
          Save Home, School or Work and the board says who is there. Arrivals can send a notice.
        </p>
      )}
      {places.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0", flexWrap: "wrap" }}>
          <Icon name="mapPin" size={14} style={{ color: "var(--color-accent-700)" }} />
          <span style={{ flex: 1, minWidth: 80, fontSize: "0.875rem" }}>{p.name}</span>
          {canManage ? (
            <>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                <input type="checkbox" checked={p.notify} disabled={pending} onChange={(e) => run(() => setPlaceNotifyAction(p.id, e.target.checked))} />
                Arrival notice
              </label>
              <button type="button" className="btn btn-ghost" disabled={pending} aria-label={`Remove ${p.name}`} onClick={() => run(() => removePlaceAction(p.id))} style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }}>
                Remove
              </button>
            </>
          ) : (
            <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{p.notify ? "Arrival notice on" : ""}</span>
          )}
        </div>
      ))}
      {canManage && (
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          <select className="input" aria-label="Place name" value={name} onChange={(e) => setName(e.target.value)} style={{ minHeight: "2.25rem", width: "auto" }}>
            {PLACE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="Other">Other…</option>
          </select>
          {name === "Other" && (
            <input className="input" aria-label="Name of the place" maxLength={40} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Lola's house" style={{ minHeight: "2.25rem", flex: "1 1 8rem" }} />
          )}
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={saveHere} style={{ minHeight: "2.25rem", fontSize: "0.8125rem" }}>
            Save where I am now
          </button>
        </div>
      )}
      {error && <div role="alert" style={{ marginTop: "0.375rem", fontSize: "0.75rem", color: "var(--color-accent-700)" }}>{error}</div>}
    </Blueprint>
  );
}
