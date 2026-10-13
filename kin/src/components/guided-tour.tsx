"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/** The guided tour on Today (agreed 13 October, answer 8A; docs/BACKLOG.md,
 * "Agreed 13 October: first open", Group C): five spotlight steps on the
 * real page -- Today, Planner, Chat, Family and health, Ask Kin.
 *
 * Shown once per member, by itself, to people who joined from the day it
 * shipped; anyone can replay it from Settings -> Show me around
 * (/today?tour=1). There is no per-member setting on the server it fits, so
 * "seen" is remembered on this phone, under the member's id. A second phone
 * shows it once more; that is the cost of not adding a column for it.
 *
 * Built in-house, no library. It is a modal dialog: focus moves into it and
 * stays there, Escape skips, the arrow keys step, each step's heading takes
 * focus so a screen reader reads it, and focus goes back where it was when
 * it closes. The spotlight moves without animation under reduced motion
 * (globals.css, kin-tour-). */

type Step = { target: string; title: string; body: string };

const STEPS: Step[] = [
  {
    target: '[data-tour="today"]',
    title: "This is Today",
    body: "What needs you today, at a glance: plans, chores, the shopping and money. Start here sits above it until your family is set up.",
  },
  {
    target: '.kin-nav a[href="/planner"]',
    title: "Planner",
    body: "The family calendar, chores that earn stars, and goals. Add a plan once and everyone sees it.",
  },
  {
    target: '.kin-nav a[href="/chat"]',
    title: "Chat",
    body: "Your family's own chat, with photos, polls and calls. Private to your household.",
  },
  {
    target: '.kin-nav a[href="/family"]',
    title: "Family and health",
    body: "Everyone's profile, allergies, medicines and emergency card, the documents vault, and who's where.",
  },
  {
    target: ".kin-fab",
    title: "Ask Kin",
    body: "Ask about anything your family keeps in Kin, or scan a school flyer straight into the calendar.",
  },
];

/** Members who joined before the tour existed can replay it, but are not
 * stopped by it. */
const SHOWN_FROM = "2026-10-13T00:00:00Z";
const seenKey = (memberId: string) => `kin-tour-seen:${memberId}`;
const PAD = 6;

type Box = { top: number; left: number; width: number; height: number };

export function GuidedTour({ memberId, memberSince, replay }: { memberId: string; memberSince: string; replay: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  // Open: replayed from Settings, or the first time for a new member.
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(seenKey(memberId)) !== null;
    } catch {
      // Storage refused (a private window): don't show it every visit.
    }
    if (!replay && (seen || memberSince < SHOWN_FROM)) return;
    // After the page has painted, so the targets are where they will stay.
    const t = window.setTimeout(() => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setStep(0);
    }, 400);
    return () => window.clearTimeout(t);
  }, [memberId, memberSince, replay]);

  const close = useCallback(() => {
    try {
      localStorage.setItem(seenKey(memberId), new Date().toISOString());
    } catch {
      // Nothing to remember it in; it closes all the same.
    }
    setStep(null);
    setBox(null);
    returnFocus.current?.focus?.();
    if (replay) router.replace("/today", { scroll: false });
  }, [memberId, replay, router]);

  // Where the step's target is, and where the card fits beside it.
  const measure = useCallback(() => {
    if (step === null) return;
    const el = document.querySelector<HTMLElement>(STEPS[step].target);
    const r = el?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardH = cardRef.current?.offsetHeight ?? 200;
    const cardW = Math.min(352, vw - 32);
    if (!r || r.width === 0 || r.height === 0) {
      // Not on the page (a narrow layout, or hidden): the card alone, centred.
      setBox(null);
      setCard({ top: Math.max(16, (vh - cardH) / 2), left: (vw - cardW) / 2 });
      return;
    }
    const b = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    setBox(b);
    const below = b.top + b.height + 12;
    const above = b.top - 12 - cardH;
    const top = below + cardH <= vh - 16 ? below : above >= 16 ? above : Math.max(16, vh - cardH - 16);
    const left = Math.min(Math.max(16, r.left + r.width / 2 - cardW / 2), vw - cardW - 16);
    setCard({ top, left });
  }, [step]);

  // Each step: bring its target into view, measure, and focus the heading.
  useLayoutEffect(() => {
    if (step === null) return;
    const el = document.querySelector<HTMLElement>(STEPS[step].target);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The tab bar and Ask Kin are fixed and need no scrolling; a link in the
    // tab bar scrolled "into view" would do nothing anyway.
    if (el && !el.closest(".kin-nav") && !el.classList.contains("kin-fab")) el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    const raf = window.requestAnimationFrame(measure);
    // Again once a smooth scroll has settled.
    const t = window.setTimeout(measure, reduce ? 0 : 350);
    headingRef.current?.focus();
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [step, measure]);

  useEffect(() => {
    if (step === null) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  if (step === null) return null;
  const last = step === STEPS.length - 1;
  const s = STEPS[step];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowRight" && !last) {
      setStep(step + 1);
    } else if (e.key === "ArrowLeft" && step > 0) {
      setStep(step - 1);
    } else if (e.key === "Tab") {
      // Keep focus inside the card while the tour is open.
      const items = cardRef.current?.querySelectorAll<HTMLElement>("button, [tabindex='-1']");
      if (!items || items.length === 0) return;
      const first = items[0];
      const end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // On <body>: Today sits inside an animated container, and a transformed
  // ancestor would make "fixed" mean fixed to it, off the tab bar it points at.
  return createPortal(
    <div className="kin-tour" onKeyDown={onKeyDown}>
      {/* The dimmed page with a hole over the target; it takes the taps, so
          nothing behind it opens mid-tour. */}
      <div className="kin-tour-scrim" data-hole={box ? "true" : undefined} aria-hidden="true" />
      {box && <div className="kin-tour-spot" aria-hidden="true" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />}
      <div
        ref={cardRef}
        className="kin-tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={card ? { top: card.top, left: card.left } : { top: 16, left: 16, opacity: 0 }}
      >
        <p className="kin-tour-count">
          {step + 1} of {STEPS.length}
        </p>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="kin-tour-title">
          {s.title}
        </h2>
        <p id={bodyId} className="kin-tour-body">
          {s.body}
        </p>
        <div className="kin-tour-actions">
          {!last && (
            <button type="button" className="btn btn-ghost kin-tour-btn" onClick={close}>
              Skip tour
            </button>
          )}
          <span style={{ flex: 1 }} />
          {step > 0 && (
            <button type="button" className="btn btn-secondary kin-tour-btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="button" className="btn btn-primary kin-tour-btn" onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
