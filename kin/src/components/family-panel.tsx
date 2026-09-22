"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { initials } from "@/lib/format";
import type { FamilyPanel as FamilyPanelData } from "@/lib/queries/family-panel";

/** The household at a glance, under the briefing and the hubs: who is here,
 * where they are if they said so, what the day looks like outside, what
 * everyone has drunk, and what is for dinner.
 *
 * A client component for one reason -- the clock. A time rendered on the
 * server is the server's time and is wrong by however long the page has been
 * open; this one ticks and is the reader's own. Everything else arrives as
 * props already resolved. */
export function FamilyPanel({ data }: { data: FamilyPanelData }) {
  if (data.people.length === 0) return null;

  return (
    <section style={{ marginTop: 26 }}>
      <h3 className="kin-eyebrow">Family</h3>

      <Blueprint style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <Clock />
          {data.weather ? (
            <span style={{ fontSize: 13.5, color: "var(--color-neutral-700)" }}>
              {data.weather.tempC}°C · {data.weather.label}
              {data.weatherNear && (
                <span style={{ color: "var(--color-neutral-600)" }}> · near {data.weatherNear}</span>
              )}
            </span>
          ) : (
            <Link href="/family?seg=quicklinks" style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
              Share a location to see the weather
            </Link>
          )}
        </div>

        {data.meals.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: 4 }}>
              EATING TODAY
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
              {data.meals.map((m, i) => (
                <span key={`${m.slot}-${i}`} style={{ fontSize: 13.5 }}>
                  <span style={{ color: "var(--color-neutral-600)", textTransform: "capitalize" }}>{m.slot}</span>{" "}
                  {m.dish}
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.people.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                className="placeholder-fill"
                style={{
                  width: 26,
                  height: 26,
                  flex: "none",
                  border: "1px solid var(--color-divider)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "600 12px/1 var(--font-heading)",
                  color: "var(--color-neutral-700)",
                }}
              >
                {initials(p.name)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{p.name.split(" ")[0]}</span>

              {p.lat !== null && p.lng !== null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12.5, color: "var(--color-accent-700)" }}
                >
                  <Icon name="mapPin" size={13} />
                  {sinceLabel(p.locationUpdatedAt)}
                </a>
              )}

              <span
                style={{ fontSize: 12.5, color: p.glasses > 0 ? "var(--color-neutral-700)" : "var(--color-neutral-500)", whiteSpace: "nowrap" }}
                title={`${p.glasses} glass${p.glasses === 1 ? "" : "es"} today`}
              >
                <Icon name="glassWater" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />
                {p.glasses}
              </span>
            </div>
          ))}
        </div>
      </Blueprint>
    </section>
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
    <span style={{ font: "600 22px/1 var(--font-heading)", minWidth: 62 }} suppressHydrationWarning>
      {now ?? " "}
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
