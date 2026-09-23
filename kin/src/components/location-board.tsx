"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { confirm } from "@/components/confirm-sheet";
import { setLocationSharingAction, reportMyLocationAction } from "@/lib/actions/location";
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
export function LocationBoard({ people, meId, myRole }: { people: MemberLocation[]; meId: string; myRole: string }) {
  const me = people.find((p) => p.memberId === meId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {me?.sharing && <Reporter />}
      {people.map((p) => (
        <PersonRow key={p.memberId} person={p} isMe={p.memberId === meId} canManage={isGrownUp(myRole)} />
      ))}
      <p style={{ fontSize: "0.75rem", lineHeight: 1.45, color: "var(--color-neutral-600)", margin: "2px 0 0" }}>
        Sharing is off until someone turns it on for themselves, and only updates while they have Kin open — a browser
        can&rsquo;t report where you are once it&rsquo;s closed. Switching it off clears the last position rather than
        just hiding it.
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

  const hasFix = person.sharing && person.lat !== null && person.lng !== null;

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
            ? "Not sharing"
            : hasFix
              ? `${sinceLabel(person.updatedAt)}${person.accuracyM !== null ? ` · ${accuracyLabel(person.accuracyM)}` : ""}`
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

      {mine && (
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
                description: "Everyone in the family will see where this is, updated while Kin is open. You can stop at any time.",
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
