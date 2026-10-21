"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { TODAY_COOKIE_MAX_AGE, todayCookieName } from "@/lib/today-fold";

/** Today's list, collapsible (Janine, 21 October). The heading is a real
 * button (aria-expanded; Enter and Space work as on any button) that folds
 * the day away to one line, and the choice is kept on this device per
 * person in a cookie the server reads. The slide is the same as the one
 * Today's Goals had (.kin-collapse), instant for anyone who asks their
 * phone for less motion. */
export function TodayFold({ memberId, open: initiallyOpen, summary, urgent, children }: { memberId: string; open: boolean; summary: string; urgent: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  const regionId = useId();
  const toggle = () => {
    const next = !open;
    setOpen(next);
    document.cookie = `${todayCookieName(memberId)}=${next ? "1" : "0"}; path=/; max-age=${TODAY_COOKIE_MAX_AGE}; samesite=lax`;
  };
  return (
    <section id="tasks" style={{ marginBottom: "1.625rem" }}>
      <button type="button" className="kin-today-head" aria-expanded={open} aria-controls={regionId} onClick={toggle}>
        <span className="kin-eyebrow" style={{ margin: 0 }}>
          Today
        </span>
        <span className="kin-today-count" data-urgent={urgent || undefined}>
          · {summary}
        </span>
        <span aria-hidden className="kin-chevron" data-open={open} style={{ marginLeft: "auto" }}>
          <Icon name="chevronLeft" size={16} />
        </span>
      </button>
      <div id={regionId} className="kin-collapse" data-open={open} inert={!open}>
        <div>{children}</div>
      </div>
    </section>
  );
}
