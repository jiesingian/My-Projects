"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { dismissStartHereAction } from "@/lib/actions/settings";
import { FIRST_OPEN_KEY, readFirstOpen, type Priority } from "@/lib/first-open";
import type { StartHere as StartHereData, StartStep, StartStepId } from "@/lib/queries/start-here";

const ICONS: Record<StartStepId, IconName> = {
  event: "calendarDays",
  invite: "users",
  children: "housePlus",
  bills: "receipt",
  chore: "check",
  list: "basket",
  health: "activity",
  location: "mapPin",
  emergency: "shieldCheck",
  documents: "fileText",
};

/** The steps this family sees, in its order: an extra only when its priority
 * is in the top 3, and each step moved up by its priority's rank -- an extra
 * just ahead of the base step that shares it. No top 3: the base steps as
 * they come. */
function arrangeSteps(steps: StartStep[], top3: readonly Priority[]): StartStep[] {
  const rank = (s: StartStep) => {
    const i = s.priority ? top3.indexOf(s.priority) : -1;
    return i < 0 ? top3.length : i;
  };
  const shown = [...steps.filter((s) => s.extra && s.priority && top3.includes(s.priority)), ...steps.filter((s) => !s.extra)];
  // Array.prototype.sort is stable, so ties keep the order above.
  return shown.sort((a, b) => rank(a) - rank(b));
}

// The saved check-up, read without a hydration mismatch: the server has none.
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};
const savedCheckUp = () => {
  try {
    return localStorage.getItem(FIRST_OPEN_KEY);
  } catch {
    return null;
  }
};

/** "Start here" on Today, for a new family (approved 28 September). Which
 * steps are done comes from the server (queries/start-here.ts); this picks
 * and orders them by the check-up's top 3 kept on this phone, draws them,
 * shares the invite, and hides the card.
 *
 * No entrance animation: it sits on Today, which people open many times a
 * day. A done step is plain and struck through rather than animated away,
 * so the four stay in place and the progress reads at a glance. */
export function StartHere({ steps: all, bonus, inviteCode }: { steps: StartStep[]; bonus: StartHereData["bonus"]; inviteCode: string }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [shared, setShared] = useState(false);
  const saved = useSyncExternalStore(subscribe, savedCheckUp, () => null);
  // `saved` is what changes; readFirstOpen parses and checks that same value.
  const steps = useMemo(() => arrangeSteps(all, saved ? (readFirstOpen()?.top3 ?? []) : []), [all, saved]);
  const earned = typeof bonus === "number" ? bonus : 0;
  if (hidden || (steps.every((s) => s.done) && !earned)) return null;

  const done = steps.filter((s) => s.done).length;

  const shareInvite = async () => {
    const url = `${window.location.origin}/join/${inviteCode.replace(/[^A-Za-z0-9]/g, "")}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join our family on Kin", text: "Tap to join our household on Kin:", url });
        return;
      } catch {
        // Cancelled, or refused: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <section className="kin-start" aria-labelledby="kin-start-title">
      <header className="kin-start-head">
        <h3 id="kin-start-title" className="kin-eyebrow" style={{ margin: 0 }}>
          Start here · {done} of {steps.length}
        </h3>
        <button
          type="button"
          className="btn btn-ghost kin-start-hide"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await dismissStartHereAction();
              if (!r.error) setHidden(true);
            })
          }
        >
          Hide
        </button>
      </header>
      {/* The trial bonus (20261013120000): while it is still possible, and once
          when it is earned. role="status" so the earned line is announced. */}
      {bonus === "open" && <p className="kin-start-bonus">Finish these today for 7 more days of Plus</p>}
      {earned > 0 && (
        <p className="kin-start-bonus" role="status">
          <Icon name="sparkle" size="0.9375rem" /> Done in a day: {earned} more days of Plus added
        </p>
      )}
      <div className="kin-brief">
        {steps.map((s) => {
          const body = (
            <>
              <span className="kin-brief-ico" data-tint={s.done ? undefined : "schedule"}>
                <Icon name={s.done ? "check" : ICONS[s.id]} size="1.0625rem" />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="kin-brief-title" data-done={s.done || undefined}>
                  {s.id === "invite" && shared ? "Invite link copied" : s.title}
                </span>
                {!s.done && <span className="kin-brief-meta">{s.hint}</span>}
              </span>
              {!s.done && <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />}
            </>
          );
          if (s.done) {
            return (
              <div key={s.id} className="kin-brief-row kin-start-done" aria-label={`${s.title}: done`}>
                {body}
              </div>
            );
          }
          return s.href ? (
            <Link key={s.id} href={s.href} className="kin-brief-row">
              {body}
            </Link>
          ) : (
            <button key={s.id} type="button" className="kin-brief-row kin-start-btn" onClick={shareInvite}>
              {body}
            </button>
          );
        })}
      </div>
    </section>
  );
}
