"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { AnimatedSheet } from "@/components/animated-sheet";
import { MemberCardBody } from "@/components/member-card";
import { SosButton } from "@/components/sos-button";
import { CheckInPrompt, type PendingCheckIn } from "@/components/check-in-prompt";
import { initials } from "@/lib/format";
import { setMyTimezoneAction } from "@/lib/actions/member-card";
import type { FamilyPanel as FamilyPanelData } from "@/lib/queries/family-panel";

/** The top of Today: the date, the household's name, the weather where the
 * family is, what is being eaten today, and everyone's initials. (The clock
 * was taken off on 12 October: the phone already shows the time.)
 *
 * This used to be two things. The initials sat up here doing nothing, and a
 * Family panel at the bottom of the page listed the same people again with
 * their location and water. Now there is one strip: tap someone's initials
 * and their card opens with what the panel used to show for them. The
 * weather and meals moved up here because they describe the day, which is
 * what the top of the page is about.
 *
 * A client component for the person cards and the meals list that opens.
 *
 * Since 30 September the card is the member card (components/member-card):
 * their time and weather, their day, and -- as far as the household's own
 * rules allow -- their money and medicines, with call, message and "Are you
 * okay?". The strip also carries Emergency SOS, and any "Are you okay?"
 * waiting on the reader. */
export function TodayHeader({
  dateLabel,
  familyName,
  data,
  fallbackPeople,
  me,
  checkIns,
}: {
  dateLabel: string;
  familyName: string;
  data: FamilyPanelData;
  /** Everyone in the household, for when the panel has no one (a brand new
   * household): the initials still show, without a card to open. */
  fallbackPeople: { id: string; full_name: string }[];
  /** The reader: whose card is "yours", and the zone their phone last said. */
  me: { id: string; timezone: string | null };
  checkIns: PendingCheckIn[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [mealsOpen, setMealsOpen] = useState(false);
  const [shownId, setShownId] = useState<string | null>(null);
  const titleId = useId();

  // The card keeps showing the last person while it slides away, so the
  // close animation never plays over an empty sheet.
  if (openId && openId !== shownId) setShownId(openId);

  // The card reads its data when it opens, so every initial opens one --
  // including a brand new household's, which has no panel rows yet.
  const people = data.people.length > 0 ? data.people.map((p) => ({ id: p.id, name: p.name })) : fallbackPeople.map((m) => ({ id: m.id, name: m.full_name }));

  // Your phone says which zone it is in, so your card can show your local
  // time to someone at home. Only when it has changed, and only your own.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== me.timezone) void setMyTimezoneAction(tz);
  }, [me.timezone]);

  return (
    <header style={{ marginBottom: "1.25rem" }}>
      {/* Wraps: at a large text size the initials and Settings take a line of
          their own under the name, rather than squeezing the name into a
          column one letter wide. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "0.625rem 0.75rem" }}>
        {/* The initials, SOS and Settings share the name's line (Janine, 12
            October) when the whole name fits beside them; a longer name takes
            the line and they move under it, so no word is ever broken. */}
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: "0.3125rem" }}>{dateLabel}</div>
          {/* Grows with the text size until a long word would no longer fit
              the phone, and wraps between words, never inside one. */}
          <h2 style={{ fontSize: "min(1.875rem, 8.5vw)", overflowWrap: "normal" }}>
            <FamilyName name={familyName} />
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="placeholder-fill kin-initial"
              onClick={() => setOpenId(p.id)}
              aria-haspopup="dialog"
              aria-label={p.id === me.id ? "Your card, and what others see on it" : `${p.name}: how they are`}
            >
              {initials(p.name)}
            </button>
          ))}
          <SosButton householdName={familyName} />
          <Link href="/settings" className="btn btn-secondary btn-icon" aria-label="Settings" style={{ marginLeft: "0.5rem" }}>
            <Icon name="settings" />
          </Link>
        </div>
      </div>

      {/* The weather and the day's meals. With no location shared, the
          weather is a sun-and-cloud button to where one is shared; the meals
          are a plate button that opens the list (Janine, 12 October). */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.84375rem", color: "var(--color-neutral-700)" }}>
        {data.weather ? (
          <span>
            {data.weather.tempC}°C · {data.weather.label}
            {data.weatherNear && <span style={{ color: "var(--color-neutral-600)" }}> · near {data.weatherNear}</span>}
          </span>
        ) : (
          data.people.length > 0 && (
            <Link href="/family?seg=quicklinks" className="btn btn-secondary btn-icon" aria-label="Share a location to see the weather" title="Share a location to see the weather">
              <Icon name="cloudSun" size={20} />
            </Link>
          )
        )}
        {data.meals.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={() => setMealsOpen((v) => !v)}
            aria-expanded={mealsOpen}
            aria-controls={`${titleId}-meals`}
            aria-label={mealsOpen ? "Hide what we're eating today" : "What we're eating today"}
            title="Eating today"
            data-active={mealsOpen}
          >
            <Icon name="mealSetting" size={20} />
          </button>
        )}
      </div>

      {data.meals.length > 0 && mealsOpen && (
        <ul id={`${titleId}-meals`} className="kin-fade-in" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: "0.625rem 0.75rem", borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 5%, transparent)", fontSize: "0.875rem", display: "grid", gap: "0.25rem" }}>
          {data.meals.map((m, i) => (
            <li key={`${m.slot}-${i}`}>
              <span style={{ color: "var(--color-neutral-600)", textTransform: "capitalize", display: "inline-block", minWidth: "5rem" }}>{m.slot}</span> {m.dish}
            </li>
          ))}
        </ul>
      )}

      <AnimatedSheet open={openId !== null} onClose={() => setOpenId(null)} labelledBy={titleId} panelClassName="sheet-panel--confirm">
        <div className="confirm-grabber" />
        {shownId && <MemberCardBody key={shownId} memberId={shownId} meId={me.id} glasses={data.people.find((p) => p.id === shownId)?.glasses ?? null} titleId={titleId} onClose={() => setOpenId(null)} />}
      </AnimatedSheet>

      {checkIns.length > 0 && (
        <div style={{ marginTop: "0.875rem" }}>
          <CheckInPrompt checkIns={checkIns} />
        </div>
      )}
    </header>
  );
}

/** The household's name, the whole of it ("The" too), in the heading font
 * like every other title (Janine, 22 October: handwriting was 12 October's,
 * and not every family would want it). */
function FamilyName({ name }: { name: string }) {
  return <span>{name}</span>;
}
