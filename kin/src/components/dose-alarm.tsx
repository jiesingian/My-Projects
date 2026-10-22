"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDoseTakenAction } from "@/lib/actions/health-care";

/** The medicine alarm (22 October): the whole screen, an alarm tone and a
 * long buzz, until "Taken" or "Not now". The tone is made here (Web Audio),
 * so there is no sound file to load; it stops by itself after three minutes.
 * A phone may hold the sound back until the screen is touched once -- the
 * first touch anywhere starts it. */

const RING_FOR_MS = 3 * 60_000;

function startAlarm(): () => void {
  let ctx: AudioContext | null = null;
  let buzz: number | undefined;
  let stopped = false;
  const beep = () => {
    if (!ctx || stopped) return;
    // Two rising tones, twice: the shape of a bedside alarm.
    const t0 = ctx.currentTime;
    [0, 0.3, 0.6, 0.9].forEach((at, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "square";
      osc.frequency.value = i % 2 ? 1046 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.25);
    });
  };
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) ctx = new AC();
  } catch {
    ctx = null;
  }
  const resume = () => void ctx?.resume().catch(() => undefined);
  resume();
  window.addEventListener("pointerdown", resume, { once: true });
  beep();
  const timer = window.setInterval(beep, 1600);
  if ("vibrate" in navigator) {
    navigator.vibrate([1000, 500, 1000, 500, 1000]);
    buzz = window.setInterval(() => navigator.vibrate([1000, 500, 1000, 500, 1000]), 4000);
  }
  const end = window.setTimeout(() => stop(), RING_FOR_MS);
  function stop() {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    window.clearInterval(buzz);
    window.clearTimeout(end);
    window.removeEventListener("pointerdown", resume);
    if ("vibrate" in navigator) navigator.vibrate(0);
    void ctx?.close().catch(() => undefined);
  }
  return stop;
}

export function DoseAlarm({
  medicineId,
  memberId,
  day,
  time,
  title,
  detail,
  alreadyTaken,
}: {
  medicineId: string;
  memberId: string;
  day: string;
  time: string;
  title: string;
  detail: string;
  alreadyTaken: boolean;
}) {
  const router = useRouter();
  const stop = useRef<() => void>(() => undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (alreadyTaken) return;
    stop.current = startAlarm();
    return () => stop.current();
  }, [alreadyTaken]);

  const leave = () => {
    stop.current();
    router.replace("/today");
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dose-alarm-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.25rem",
        padding: "max(1.5rem, env(safe-area-inset-top)) var(--gutter) max(1.5rem, env(safe-area-inset-bottom))",
        background: "var(--color-accent-700, #b4231b)",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <div aria-hidden="true" className="kin-dose-alarm-bell" style={{ fontSize: "4rem", lineHeight: 1 }}>
        ⏰
      </div>
      <h1 id="dose-alarm-title" style={{ margin: 0, font: "700 2rem/1.15 var(--font-heading)" }}>
        {alreadyTaken ? "Already taken" : title}
      </h1>
      <p style={{ margin: 0, fontSize: "1.25rem", opacity: 0.9 }}>{detail}</p>
      {error && <p style={{ margin: 0, fontWeight: 600 }}>{error}</p>}
      {alreadyTaken ? (
        <button type="button" className="btn" style={{ minHeight: "3.5rem", minWidth: "14rem", fontSize: "1.125rem", background: "#fff", color: "#000" }} onClick={leave}>
          Back to Today
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn"
            disabled={pending}
            style={{ minHeight: "4rem", minWidth: "16rem", fontSize: "1.375rem", fontWeight: 700, background: "#fff", color: "#000", borderRadius: 999 }}
            onClick={() => {
              stop.current();
              start(async () => {
                const res = await setDoseTakenAction({ medicineId, memberId, day, time, taken: true });
                if (res.error) {
                  setError(res.error);
                  return;
                }
                router.replace("/today");
              });
            }}
          >
            {pending ? "…" : "Taken"}
          </button>
          <button type="button" className="btn" style={{ minHeight: "3rem", minWidth: "12rem", fontSize: "1rem", background: "transparent", color: "#fff", border: "2px solid rgba(255,255,255,0.7)", borderRadius: 999 }} onClick={leave}>
            Not now
          </button>
          <p style={{ margin: 0, fontSize: "0.875rem", opacity: 0.85 }}>Not now stops the sound. Kin reminds you again in a few minutes until it&apos;s ticked.</p>
        </>
      )}
    </div>
  );
}

/** Kin already open when a dose is due: the service worker says so and the
 * alarm takes the screen at once (public/sw.js, "kin:dose-alarm"). */
export function DoseAlarmListener() {
  const router = useRouter();
  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === "kin:dose-alarm" && typeof d.url === "string" && d.url.startsWith("/today/dose?")) router.push(d.url);
    };
    sw.addEventListener("message", onMessage);
    return () => sw.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
