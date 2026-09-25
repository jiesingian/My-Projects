"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { AnimatedSheet } from "@/components/animated-sheet";
import { initials } from "@/lib/format";
import type { FamilyPanel as FamilyPanelData, FamilyPanelPerson } from "@/lib/queries/family-panel";

/** The top of Today: the date, the household's name, the time and weather
 * where the family is, what is being eaten today, and everyone's initials.
 *
 * This used to be two things. The initials sat up here doing nothing, and a
 * Family panel at the bottom of the page listed the same people again with
 * their location and water. Now there is one strip: tap someone's initials
 * and their card opens with what the panel used to show for them. The clock,
 * weather and meals moved up here because they describe the day, which is
 * what the top of the page is about.
 *
 * A client component for two reasons -- the clock, and the person cards. A
 * time rendered on the server is the server's time and is wrong by however
 * long the page has been open; this one ticks and is the reader's own. */
export function TodayHeader({
  dateLabel,
  familyName,
  data,
  fallbackPeople,
}: {
  dateLabel: string;
  familyName: string;
  data: FamilyPanelData;
  /** Everyone in the household, for when the panel has no one (a brand new
   * household): the initials still show, without a card to open. */
  fallbackPeople: { id: string; full_name: string }[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  const titleId = useId();

  // The card keeps showing the last person while it slides away, so the
  // close animation never plays over an empty sheet.
  if (openId && openId !== shownId) setShownId(openId);
  const shown = data.people.find((p) => p.id === shownId) ?? null;

  const people = data.people.length > 0 ? data.people.map((p) => ({ id: p.id, name: p.name, card: true })) : fallbackPeople.map((m) => ({ id: m.id, name: m.full_name, card: false }));

  return (
    <header style={{ marginBottom: "1.25rem" }}>
      {/* Wraps: at a large text size the initials and Settings take a line of
          their own under the name, rather than squeezing the name into a
          column one letter wide. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "0.625rem 0.75rem" }}>
        <div style={{ flex: "1 1 11rem", minWidth: 0 }}>
          <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: "0.3125rem" }}>{dateLabel}</div>
          {/* Grows with the text size until a long word would no longer fit
              the phone, and stops there instead of breaking the word. */}
          <h2 style={{ fontSize: "min(1.875rem, 11vw)" }}>{familyName}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
          {people.map((p) =>
            p.card ? (
              <button
                key={p.id}
                type="button"
                className="placeholder-fill kin-initial"
                onClick={() => setOpenId(p.id)}
                aria-haspopup="dialog"
                aria-label={`${p.name}: location and today`}
              >
                {initials(p.name)}
              </button>
            ) : (
              <span key={p.id} className="placeholder-fill kin-initial" aria-hidden="true">
                {initials(p.name)}
              </span>
            ),
          )}
          <Link href="/settings" className="btn btn-secondary btn-icon" aria-label="Settings" style={{ marginLeft: "0.625rem" }}>
            <Icon name="settings" />
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.84375rem", color: "var(--color-neutral-700)" }}>
        <Clock />
        {data.weather ? (
          <span>
            {data.weather.tempC}°C · {data.weather.label}
            {data.weatherNear && <span style={{ color: "var(--color-neutral-600)" }}> · near {data.weatherNear}</span>}
          </span>
        ) : (
          data.people.length > 0 && (
            <Link href="/family?seg=quicklinks" style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
              Share a location to see the weather
            </Link>
          )
        )}
      </div>

      {data.meals.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.125rem 0.75rem", marginTop: "0.25rem", fontSize: "0.8125rem" }}>
          <span style={{ color: "var(--color-neutral-600)" }}>Eating today</span>
          {data.meals.map((m, i) => (
            <span key={`${m.slot}-${i}`}>
              <span style={{ color: "var(--color-neutral-600)", textTransform: "capitalize" }}>{m.slot}</span> {m.dish}
            </span>
          ))}
        </div>
      )}

      <AnimatedSheet open={openId !== null} onClose={() => setOpenId(null)} labelledBy={titleId} panelClassName="sheet-panel--confirm">
        <div className="confirm-grabber" />
        {shown && <PersonCard person={shown} titleId={titleId} onClose={() => setOpenId(null)} />}
      </AnimatedSheet>
    </header>
  );
}

function PersonCard({ person, titleId, onClose }: { person: FamilyPanelPerson; titleId: string; onClose: () => void }) {
  const sharing = person.lat !== null && person.lng !== null;
  return (
    <>
      <p id={titleId} className="confirm-title">
        {person.name}
      </p>
      <div className="kin-person-rows">
        <div className="kin-person-row">
          <Icon name="mapPin" size={16} />
          {sharing ? (
            <a href={`https://www.google.com/maps/search/?api=1&query=${person.lat},${person.lng}`} target="_blank" rel="noopener noreferrer">
              On the map · {sinceLabel(person.locationUpdatedAt) === "now" ? "just now" : `${sinceLabel(person.locationUpdatedAt)} ago`}
            </a>
          ) : (
            <span style={{ color: "var(--color-neutral-600)" }}>Not sharing a location</span>
          )}
        </div>
        <div className="kin-person-row">
          <Icon name="glassWater" size={16} />
          <span>
            {person.glasses} glass{person.glasses === 1 ? "" : "es"} of water today
          </span>
        </div>
      </div>
      <div className="confirm-actions">
        <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
          Close
        </button>
        <Link href={`/family/members/${person.id}`} className="btn btn-primary btn-block" onClick={onClose}>
          Open profile
        </Link>
      </div>
    </>
  );
}

function Clock() {
  // Rendered empty first, then filled once mounted. The server has no idea
  // what time it is where the reader is, and printing its own guess would
  // hydrate into a visible correction.
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className={now ? "kin-fade-in" : undefined} style={{ font: "600 0.9375rem/1 var(--font-heading)", color: "var(--color-text)", minWidth: "2.75rem" }} suppressHydrationWarning>
      {now ?? " "}
    </span>
  );
}

function sinceLabel(iso: string | null): string {
  if (!iso) return "now";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
