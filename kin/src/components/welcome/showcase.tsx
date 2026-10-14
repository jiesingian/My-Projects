"use client";

import { useRef, useState, type Ref } from "react";
import { Icon, type IconName } from "@/components/icons";
import { PRIORITIES, type Priority } from "@/lib/first-open";
import { scrollBehavior } from "@/lib/motion";

/** The showcase after the check-up's result (agreed 13 October, answer 5):
 * three slides from the visitor's top 3, then "one app, private to your
 * family". Swipeable, and skippable at any point.
 *
 * Each slide holds a small phone drawn here from made-up sample data rather
 * than a screenshot: the people are the sample household's (Quinn and Pat,
 * docs/QA_HOUSEHOLDS.md) and every number is invented. No real household's
 * records may ever appear on this page. */

type Row = { main: string; side?: string; sub?: string };
type Slide = { id: string; icon: IconName; title: string; line: string; screen: string; rows: Row[]; plus?: boolean };

const SLIDES: Record<Priority, Slide> = {
  health: {
    id: "health",
    icon: "activity",
    title: "Everyone’s health, one tap away",
    line: "Allergies, blood type, doctor and insurance on each person’s profile, for whoever is awake at 2 a.m.",
    screen: "Pat · Health",
    rows: [
      { main: "Blood type", side: "O+" },
      { main: "Allergies", side: "Penicillin" },
      { main: "Doctor", side: "Dr. Reyes" },
      { main: "PhilHealth", side: "•••• 2041" },
    ],
  },
  documents: {
    id: "documents",
    icon: "fileText",
    title: "Papers you can find",
    line: "PSA certificates, passports and policies in the vault, behind Face ID or a PIN.",
    screen: "Vault",
    plus: true,
    rows: [
      { main: "PSA birth certificate", sub: "Quinn" },
      { main: "Passport", sub: "Pat", side: "to 2031" },
      { main: "Home insurance", sub: "Policy", side: "to Mar" },
    ],
  },
  travel: {
    id: "travel",
    icon: "plane",
    title: "Trips, planned together",
    line: "Who’s going, what to pack, and the budget beside what was spent, in the same planner as everything else.",
    screen: "Planner · Trip",
    rows: [
      { main: "Baguio weekend", sub: "Pat, Quinn", side: "Nov 21" },
      { main: "Packing list", side: "8 of 12" },
      { main: "Budget", sub: "Spent ₱6,200", side: "₱15,000" },
    ],
  },
  plans: {
    id: "plans",
    icon: "calendarDays",
    title: "One family calendar",
    line: "School, work and plans in one place, synced with Google Calendar, with chores that earn stars.",
    screen: "Planner · Today",
    rows: [
      { main: "School run", sub: "Pat", side: "7:15" },
      { main: "Family dinner", sub: "Everyone", side: "18:30" },
      { main: "Wash the dishes", sub: "Chore", side: "★ 2" },
    ],
  },
  meals: {
    id: "meals",
    icon: "basket",
    title: "One shopping list",
    line: "A list everyone adds to, with prices, the pantry, and what’s for dinner this week.",
    screen: "Shopping",
    rows: [
      { main: "Rice, 5 kg", side: "₱280" },
      { main: "Eggs, 1 tray", side: "₱230" },
      { main: "Bananas", side: "₱60" },
      { main: "Total", side: "₱570" },
    ],
  },
  money: {
    id: "money",
    icon: "wallet",
    title: "Money, together",
    line: "What’s left this month, the bills and when they fall due, and who’s paying what.",
    screen: "Wealth",
    plus: true,
    rows: [
      { main: "Left this month", side: "₱18,400" },
      { main: "Electric bill", sub: "Due Friday", side: "₱3,250" },
      { main: "Internet", sub: "Due the 20th", side: "₱1,699" },
    ],
  },
  memories: {
    id: "memories",
    icon: "images",
    title: "Memories that stay",
    line: "A family journal of photos, milestones and first days, shared with the relatives you choose.",
    screen: "Journal",
    rows: [
      { main: "First night in the new house", sub: "Quinn · 3 photos" },
      { main: "Pat’s birthday", sub: "4 reactions" },
    ],
  },
  together: {
    id: "together",
    icon: "message",
    title: "Time together, easier to arrange",
    line: "A family chat with polls and voice and video calls, next to the calendar of what you’re doing together.",
    screen: "Family chat",
    rows: [
      { main: "Poll", sub: "Movie night: Friday or Saturday?", side: "3 votes" },
      { main: "Quinn", sub: "Video call · 24 min" },
    ],
  },
  emergency: {
    id: "emergency",
    icon: "shieldCheck",
    title: "The emergency card",
    line: "Blood type, allergies, doctor and insurance on one screen that reads at arm’s length.",
    screen: "Emergency · Quinn",
    rows: [
      { main: "Blood type", side: "A+" },
      { main: "Allergies", side: "None known" },
      { main: "Doctor", side: "Dr. Lim" },
      { main: "Insurance", side: "Policy 88-1032" },
    ],
  },
  kids: {
    id: "kids",
    icon: "mapPin",
    title: "Home safe, without ten calls",
    line: "Location sharing that each person switches on for themselves, next to the family calendar.",
    screen: "Places",
    rows: [
      { main: "Pat", sub: "Home", side: "now" },
      { main: "Quinn", sub: "Work", side: "12 min" },
    ],
  },
};

const LAST: Slide = {
  id: "one",
  icon: "house",
  title: "One app, private to your family",
  line: "The chat sits next to everything it’s about. Each household is walled off from every other. Nothing is sold, and your records never train AI.",
  screen: "Family chat",
  rows: [
    { main: "Quinn", sub: "Dinner at 7 tonight?" },
    { main: "Poll", sub: "Sinigang or adobo?", side: "2 votes" },
    { main: "Pat", sub: "Sinigang 🙌" },
  ],
};

/** The visitor's top 3 first; anyone who picked fewer gets the rest in the
 * order question 3 lists them. Then the closing slide. */
export function showcaseSlides(top3: Priority[]): Slide[] {
  const picks = [...top3, ...PRIORITIES.filter((p) => !top3.includes(p))].slice(0, 3);
  return [...picks.map((p) => SLIDES[p]), LAST];
}

export function Showcase({ top3, onDone, onBack, heading }: { top3: Priority[]; onDone: () => void; onBack: () => void; heading: Ref<HTMLHeadingElement> }) {
  const slides = showcaseSlides(top3);
  const [at, setAt] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  // Where a button sent the track. Until it gets there, the scroll events of
  // the smooth scroll on the way are not the visitor's position, so a quick
  // second tap of Next still moves on one from the slide it is heading to.
  const headingTo = useRef<number | null>(null);
  const last = at >= slides.length - 1;

  const goTo = (i: number) => {
    headingTo.current = i;
    setAt(i);
    track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: scrollBehavior() });
  };

  return (
    <section className="kin-welcome-step kin-check-show">
      <h2 ref={heading} tabIndex={-1}>
        How Kin helps
      </h2>
      <div
        className="kin-check-track"
        ref={track}
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label="How Kin helps"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (headingTo.current !== null && i !== headingTo.current) return;
          headingTo.current = null;
          setAt(i);
        }}
      >
        {slides.map((s, i) => (
          <article key={s.id} className="kin-check-slide" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
            <Phone slide={s} />
            <h3>
              {s.title}
              {s.plus && <span className="kin-plus-badge">PLUS</span>}
            </h3>
            <p>{s.line}</p>
          </article>
        ))}
      </div>
      <div className="kin-check-dots" aria-hidden="true">
        {slides.map((s, i) => (
          <span key={s.id} data-on={i === at || undefined} />
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-block kin-welcome-cta" onClick={() => (last ? onDone() : goTo(at + 1))}>
        {last ? "Choose your plan" : "Next"}
      </button>
      <div className="kin-check-row">
        <button type="button" className="btn btn-ghost kin-check-secondary" onClick={() => (at === 0 ? onBack() : goTo(at - 1))}>
          Back
        </button>
        {!last && (
          <button type="button" className="btn btn-ghost kin-check-secondary" onClick={onDone}>
            Skip
          </button>
        )}
      </div>
    </section>
  );
}

/** A small phone showing one screen of the sample household. Decorative to
 * a screen reader beyond its name: the slide's words say what it shows. */
function Phone({ slide }: { slide: Slide }) {
  return (
    <div className="kin-check-phone" role="img" aria-label={`${slide.screen}, sample household`}>
      <div className="kin-check-phone-top">
        <Icon name={slide.icon} size={16} />
        <span>{slide.screen}</span>
      </div>
      <ul>
        {slide.rows.map((r) => (
          <li key={r.main + (r.sub ?? "")}>
            <span>
              <strong>{r.main}</strong>
              {r.sub && <small>{r.sub}</small>}
            </span>
            {r.side && <em>{r.side}</em>}
          </li>
        ))}
      </ul>
      <span className="kin-check-phone-tag">Sample household</span>
    </div>
  );
}
