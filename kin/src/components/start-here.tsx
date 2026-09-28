"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { dismissStartHereAction } from "@/lib/actions/settings";
import type { StartStep } from "@/lib/queries/start-here";

const ICONS: Record<StartStep["id"], IconName> = {
  event: "calendarDays",
  invite: "users",
  bills: "receipt",
  chore: "check",
  list: "basket",
};

/** "Start here" on Today, for a new family (approved 28 September). Which
 * steps are done comes from the server (queries/start-here.ts); this only
 * draws them, shares the invite, and hides the card.
 *
 * No entrance animation: it sits on Today, which people open many times a
 * day. A done step is plain and struck through rather than animated away,
 * so the four stay in place and the progress reads at a glance. */
export function StartHere({ steps, inviteCode }: { steps: StartStep[]; inviteCode: string }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [shared, setShared] = useState(false);
  if (hidden) return null;

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
