"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { saveNextVoteAction } from "@/lib/actions/next-vote";
import { NEXT_CHOICES, type NextChoice } from "@/lib/next-vote";

const LATER = "kin-next-vote-later";

/** The question itself: one tap to answer, "Not now" hides it on this
 * device for a month. Answered, it says thanks and goes. */
export function NextVoteCard() {
  const [hidden, setHidden] = useState(true);
  const [choice, setChoice] = useState<NextChoice | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      const later = Number(localStorage.getItem(LATER) ?? 0);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading this device's "Not now" once, after hydration
      setHidden(!!later && Date.now() - later < 30 * 86_400_000);
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  if (done)
    return (
      <p className="blueprint" style={{ padding: "0.75rem 0.9375rem", margin: "0 0 0.875rem", fontSize: "0.875rem" }}>
        Thank you. Your answer helps decide what Kin builds next.
      </p>
    );

  return (
    <section className="blueprint" aria-labelledby="next-vote-h" style={{ padding: "0.75rem 0.9375rem", marginBottom: "0.875rem" }}>
      <h2 id="next-vote-h" style={{ font: "600 1rem/1.25 var(--font-heading)", margin: "0 0 0.5rem" }}>
        What should Kin do next for your family?
      </h2>
      <div role="radiogroup" aria-labelledby="next-vote-h" style={{ display: "grid", gap: "0.25rem" }}>
        {NEXT_CHOICES.map((c) => (
          <label key={c.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", minHeight: "2.25rem", fontSize: "0.875rem", cursor: "pointer" }}>
            <input type="radio" name="next-vote" checked={choice === c.id} onChange={() => setChoice(c.id)} style={{ width: 18, height: 18 }} />
            {c.label}
          </label>
        ))}
      </div>
      {choice === "other" && <input className="input" aria-label="What else" placeholder="Tell us in a few words" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: "0.375rem", width: "100%" }} />}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.625rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!choice || pending}
          onClick={() =>
            start(async () => {
              const r = await saveNextVoteAction(choice!, note);
              if (r.error) toast.error(r.error);
              else setDone(true);
            })
          }
        >
          {pending ? "…" : "Send"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            try {
              localStorage.setItem(LATER, String(Date.now()));
            } catch {}
            setHidden(true);
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
