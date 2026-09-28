"use client";

import { useState, useTransition } from "react";
import { Blueprint } from "@/components/ui";
import { ErrorText } from "@/components/form";
import { greetOccasionAction, removeGreetingAction } from "@/lib/actions/family-links";
import { occasionHeadline, type FeedOccasion } from "@/lib/occasions";

/** A birthday or anniversary at the top of the family feed, on the day
 * (agreed 28 September): "Lola Rosa turns 72 today 🎂", whose household it
 * is, the greetings sent so far, and a line to send one. Self-contained on
 * purpose -- the journal is due to be restructured, and this card should be
 * able to move with nothing but its props. */
export function OccasionCard({ occasion }: { occasion: FeedOccasion }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headline = occasionHeadline(occasion.title, occasion.kind, occasion.years);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    startTransition(async () => {
      const { error } = await greetOccasionAction(occasion.eventId, body);
      setError(error);
      if (!error) setDraft("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const { error } = await removeGreetingAction(id);
      setError(error);
    });
  }

  return (
    <Blueprint className="kin-occasion" style={{ padding: "1rem 0.9375rem" }}>
      <div style={{ fontSize: "0.75rem", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
        Today · {occasion.isOurs ? "Ours" : occasion.householdName}
      </div>
      <h3 style={{ font: "600 1.25rem/1.25 var(--font-heading)", letterSpacing: "-0.01em", margin: "0.25rem 0 0", textWrap: "balance" }}>
        {headline}
      </h3>

      {occasion.greetings.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {occasion.greetings.map((g) => (
            <li key={g.id} className="kin-occasion-greeting">
              <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.4 }}>{g.body}</p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.125rem" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                  {g.authorName.split(" ")[0] || "Someone"}
                  {g.ourHousehold ? "" : ` · ${g.householdName}`}
                </span>
                {g.mine && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pending}
                    onClick={() => remove(g.id)}
                    style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={send} style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <input
          className="input"
          aria-label={`Greeting for ${headline}`}
          placeholder={occasion.kind === "birthday" ? "Send a birthday greeting" : "Send a greeting"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          enterKeyHint="send"
          style={{ flex: 1, minWidth: 0, minHeight: "2.75rem" }}
        />
        <button type="submit" className="btn btn-primary" disabled={pending || !draft.trim()} style={{ minHeight: "2.75rem", paddingInline: "1rem" }}>
          Send
        </button>
      </form>
      <ErrorText message={error} />
    </Blueprint>
  );
}
