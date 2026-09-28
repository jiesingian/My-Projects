"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import type { BriefItem } from "@/lib/queries/today";
import type { Whose } from "@/lib/for-me";

/** Today's "Coming up" as three pages, swiped sideways (28 September).
 *
 * Janine: "swiping right" for other family members' activities and events,
 * "swiping left" for my own personal ones, the box keeping its size. So it
 * opens on the family's page in the middle; a swipe to the right brings in
 * everyone else's from the left, a swipe to the left brings in the reader's
 * own from the right. The labels above name all three and can be tapped, so
 * nobody has to guess which way is which.
 *
 * Native scroll-snap does the swiping -- it follows the finger, flicks and
 * settles the way the phone's own pagers do, costs no script per frame, and
 * gives up the vertical scroll to the page. All three boxes share one grid
 * row, so each is as tall as the tallest and the box does not jump in size
 * from page to page. */
const PAGES: { id: Whose; label: string; empty: string }[] = [
  { id: "others", label: "Others", empty: "Nothing coming up for anyone else this week." },
  { id: "family", label: "Family", empty: "Nothing for the whole family this week." },
  { id: "mine", label: "Mine", empty: "Nothing of yours coming up this week." },
];
const HOME = 1;

export function ComingUpPager({ items }: { items: BriefItem[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(HOME);

  // Open on the family's page, without a visible scroll to get there.
  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = el.clientWidth * HOME;
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== page) setPage(next);
  };

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: el.clientWidth * i, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="kin-pager">
      <div className="kin-pager-tabs" role="tablist" aria-label="Whose plans">
        {PAGES.map((p, i) => {
          const n = items.filter((b) => (b.whose ?? "family") === p.id).length;
          return (
            <button key={p.id} type="button" role="tab" aria-selected={page === i} className="kin-pager-tab" onClick={() => go(i)}>
              {p.label}
              {n > 0 && <span className="kin-pager-count">{n}</span>}
            </button>
          );
        })}
      </div>
      <div ref={track} className="kin-pager-track" onScroll={onScroll}>
        {PAGES.map((p, i) => {
          const rows = items.filter((b) => (b.whose ?? "family") === p.id);
          return (
            <div key={p.id} className="kin-pager-page" role="tabpanel" aria-label={p.label} aria-hidden={page !== i}>
              <div className="kin-brief">
                {rows.length === 0 ? (
                  <p className="kin-pager-empty">{p.empty}</p>
                ) : (
                  rows.map((b) => (
                    <Link key={b.id} href={b.href} className="kin-brief-row" tabIndex={page === i ? undefined : -1}>
                      <span className="kin-brief-ico" data-tint={b.tint}>
                        <Icon name={b.icon} size="1.0625rem" />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="kin-brief-title">{b.title}</span>
                        <span className="kin-brief-meta">{b.meta}</span>
                      </span>
                      <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
