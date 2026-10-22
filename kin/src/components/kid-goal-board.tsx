"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gameTapAction } from "@/lib/actions/game";
import { boardGoals, progressPips } from "@/lib/kid-board";

export type KidBoardGoal = { id: string; title: string; emoji: string; current: number; target: number; reached: boolean };

/** A young child's goals as a sticker board (Janine, 20 October): big
 * pictures instead of numbers, three or four at a time, the next one coming
 * as each is done. A grown-up taps for the child -- that tap is the
 * grown-up's yes. Completing one plays a little tune and drops its sticker
 * on the row below; nobody who asked their phone for less motion sees it
 * move, and the sound can be muted on this device. */
export function KidGoalBoard({ name, goals }: { name: string; goals: KidBoardGoal[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);
  // Muted is remembered on this device (a convenience, not shared state).
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);
  const audio = useRef<AudioContext | null>(null);

  const { showing, stickers, waiting } = boardGoals(goals, 4);

  const play = (notes: number[]) => {
    if (muted) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio.current ??= new Ctor();
      const ctx = audio.current;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.09;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch {
      // No sound is fine.
    }
  };

  const tap = (g: KidBoardGoal) => {
    const completes = g.current + 1 >= g.target;
    play(completes ? [523, 659, 784, 1047] : [660]);
    start(async () => {
      const r = await gameTapAction(g.id);
      setError(r.error);
      if (!r.error) {
        if (completes) setJustDone(g.id);
        router.refresh();
      }
    });
  };

  const toggleMute = () => writeMuted(!muted);

  return (
    <div className="kin-kid-board" aria-label={`${name}'s goals`}>
      <div className="kin-kid-board-head">
        <span>{showing.length === 0 ? `${name} did everything today! 🎉` : "Tap a picture when it’s done"}</span>
        <button type="button" className="kin-kid-mute" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Turn sounds on" : "Turn sounds off"}>
          {muted ? "🔇" : "🔊"}
        </button>
      </div>
      <div className="kin-kid-tiles">
        {showing.map((g) => (
          <button key={g.id} type="button" className="kin-kid-tile" disabled={pending} onClick={() => tap(g)} aria-label={`${g.title}: ${Math.min(g.current, g.target)} of ${g.target}. Tap when done.`}>
            <span className="kin-kid-emoji" aria-hidden>
              {g.emoji}
            </span>
            <span className="kin-kid-title">{g.title}</span>
            <span className="kin-kid-pips" aria-hidden>
              {progressPips(g.current, g.target).map((on, i) => (
                <span key={i} className="kin-kid-pip" data-on={on} />
              ))}
            </span>
          </button>
        ))}
      </div>
      {waiting > 0 && <div className="kin-kid-more">{waiting} more after these</div>}
      {stickers.length > 0 && (
        <div className="kin-kid-stickers" aria-label={`Stickers today: ${stickers.length}`}>
          {stickers.map((g) => (
            <span key={g.id} className="kin-kid-sticker" data-new={g.id === justDone} title={g.title}>
              {g.emoji}
            </span>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion-ink)", marginTop: "0.5rem" }}>
          {error}
        </div>
      )}
    </div>
  );
}

const MUTED_KEY = "kin-kid-board-muted";
const mutedListeners = new Set<() => void>();
let mutedFallback = false;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    // Storage unavailable (a private window): remembered while the page is open.
    return mutedFallback;
  }
}

function writeMuted(next: boolean) {
  mutedFallback = next;
  try {
    localStorage.setItem(MUTED_KEY, next ? "1" : "0");
  } catch {
    // Kept in memory only.
  }
  mutedListeners.forEach((l) => l());
}

function subscribeMuted(listener: () => void) {
  mutedListeners.add(listener);
  return () => mutedListeners.delete(listener);
}
