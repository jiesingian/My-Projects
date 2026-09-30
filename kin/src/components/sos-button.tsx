"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatedSheet } from "@/components/animated-sheet";
import { SOS_COUNTDOWN_S, SOS_HOLD_MS } from "@/lib/member-card";
import { sendSosAction, sosAction } from "@/lib/actions/sos";
import styles from "./member-card.module.css";

type Phase =
  | { at: "hold" }
  | { at: "countdown"; left: number }
  | { at: "sending" }
  | { at: "sent"; id: string; notified: number; grownUps: number; located: boolean }
  | { at: "safe" }
  | { at: "error"; message: string };

type Fix = { lat: number; lng: number; accuracy: number | null };

/** Emergency SOS (approved 30 September). Two guards stand between a finger
 * and an alert, so neither a pocket nor a toddler can send one:
 *
 *   1. The small SOS pill only opens a sheet. Nothing is sent from it.
 *   2. In the sheet, the big button has to be held for three seconds -- the
 *      ring round it fills while held and snaps back the moment it is let go.
 *   3. Then five seconds count down with a large Cancel. Closing the sheet
 *      cancels too. Only when the count reaches nought is anything sent.
 *
 * The position is asked for when the hold completes, not before, so the
 * browser's permission prompt (the first time) lands in the countdown rather
 * than interrupting the hold. If the phone refuses or is slow, the alert goes
 * without a position and says so. */
export function SosButton({ householdName }: { householdName: string }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <>
      <button type="button" className={styles.sosTrigger} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Emergency SOS">
        SOS
      </button>
      <AnimatedSheet open={open} onClose={() => setOpen(false)} labelledBy={titleId} role="alertdialog" panelClassName="sheet-panel--confirm">
        <div className="confirm-grabber" />
        {open && <SosFlow titleId={titleId} householdName={householdName} onClose={() => setOpen(false)} />}
      </AnimatedSheet>
    </>
  );
}

function SosFlow({ titleId, householdName, onClose }: { titleId: string; householdName: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ at: "hold" });
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const fix = useRef<Fix | null>(null);
  const locating = useRef<Promise<void> | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const stopHold = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  }, []);

  const locate = () => {
    if (!("geolocation" in navigator)) return;
    locating.current = new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          fix.current = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null };
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 },
      );
    });
  };

  const send = useCallback(async () => {
    setPhase({ at: "sending" });
    // Waits a little longer for a position still on its way, never long.
    if (!fix.current && locating.current) await Promise.race([locating.current, new Promise((r) => setTimeout(r, 2500))]);
    const res = await sendSosAction(fix.current);
    if (res.error || !res.id) setPhase({ at: "error", message: res.error ?? "The alert could not be sent." });
    else setPhase({ at: "sent", id: res.id, notified: res.notified ?? 0, grownUps: res.grownUps ?? 0, located: !!fix.current });
  }, []);

  const startCountdown = () => {
    stopHold();
    if ("vibrate" in navigator) navigator.vibrate(80);
    locate();
    let left = SOS_COUNTDOWN_S;
    setPhase({ at: "countdown", left });
    tick.current = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        if (tick.current) clearInterval(tick.current);
        tick.current = null;
        void send();
      } else setPhase({ at: "countdown", left });
    }, 1000);
  };

  const beginHold = () => {
    if (phase.at !== "hold" || holdTimer.current) return;
    setHolding(true);
    holdTimer.current = setTimeout(startCountdown, SOS_HOLD_MS);
  };

  const cancel = () => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    setPhase({ at: "hold" });
  };

  // Leaving the sheet mid-countdown is a cancel, not a send.
  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (phase.at === "countdown" && phase.left === SOS_COUNTDOWN_S) cancelRef.current?.focus();
  }, [phase]);

  if (phase.at === "countdown" || phase.at === "sending") {
    return (
      <div className={styles.sos} aria-live="assertive">
        <p id={titleId} className="confirm-title">
          {phase.at === "sending" ? "Sending SOS…" : "Sending SOS in"}
        </p>
        {phase.at === "countdown" && <div className={styles.count}>{phase.left}</div>}
        <p className={styles.sosLead}>Every grown-up in {householdName} gets an urgent alert with where you are, if your phone allows it.</p>
        {phase.at === "countdown" && (
          <button ref={cancelRef} type="button" className={`btn btn-primary ${styles.cancel}`} onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
    );
  }

  if (phase.at === "sent") {
    return <Sent phase={phase} titleId={titleId} onSafe={() => setPhase({ at: "safe" })} onClose={onClose} />;
  }

  if (phase.at === "safe") {
    return (
      <div className={styles.sos}>
        <p id={titleId} className="confirm-title">
          Glad you&rsquo;re safe
        </p>
        <p className={styles.sosLead}>The grown-ups have been told the SOS is over.</p>
        <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className={styles.sos}>
      <p id={titleId} className="confirm-title">
        Emergency SOS
      </p>
      <p className={styles.sosLead}>
        Hold the button for {SOS_HOLD_MS / 1000} seconds. You&rsquo;ll have {SOS_COUNTDOWN_S} seconds to cancel before every grown-up in {householdName} is alerted.
      </p>
      <button
        type="button"
        className={styles.hold}
        // Vaul would otherwise read a held finger as the start of a drag.
        data-vaul-no-drag=""
        data-holding={holding ? "true" : "false"}
        style={{ ["--hold-ms" as string]: `${SOS_HOLD_MS}ms` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          beginHold();
        }}
        onPointerUp={stopHold}
        onPointerCancel={stopHold}
        onLostPointerCapture={stopHold}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            beginHold();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") stopHold();
        }}
        onBlur={stopHold}
        aria-describedby={`${titleId}-hint`}
      >
        <svg className={styles.ring} viewBox="0 0 100 100" aria-hidden="true">
          <circle className={styles.ringTrack} cx="50" cy="50" r="47" />
          <circle className={styles.ringFill} cx="50" cy="50" r="47" strokeDasharray="295.3" style={{ strokeDashoffset: holding ? 0 : 295.3 }} />
        </svg>
        SOS
        <small>{holding ? "Keep holding" : "Press and hold"}</small>
      </button>
      <span id={`${titleId}-hint`} className="sr-only">
        Press and hold for {SOS_HOLD_MS / 1000} seconds to start a {SOS_COUNTDOWN_S} second countdown.
      </span>
      <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
        Not now
      </button>
    </div>
  );
}

function Sent({ phase, titleId, onSafe, onClose }: { phase: Extract<Phase, { at: "sent" }>; titleId: string; onSafe: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const reached = phase.notified > 0;
  return (
    <div className={styles.sos} aria-live="assertive">
      <p id={titleId} className="confirm-title">
        {reached ? "SOS sent" : phase.grownUps === 0 ? "SOS saved" : "SOS saved — phones not reached"}
      </p>
      <p className={styles.sosLead}>
        {reached
          ? `Delivered to ${phase.notified} phone${phase.notified === 1 ? "" : "s"}${phase.located ? ", with where you are" : ", without a location — your phone didn't share one"}.`
          : phase.grownUps === 0
            ? "There's no other grown-up in the household to alert. Call someone now."
            : "No grown-up's phone could be reached by notification. Call them now."}
      </p>
      <Link href={`/today/sos/${phase.id}`} className="btn btn-primary btn-block" onClick={onClose}>
        Open the alert and call
      </Link>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await sosAction(phase.id, "safe");
          setBusy(false);
          if (!res.error) onSafe();
        }}
      >
        I&rsquo;m safe now
      </button>
    </div>
  );
}
