"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMemberColourAction } from "@/lib/actions/profile";
import { MEMBER_COLOURS, MEMBER_COLOUR_LABEL, memberColour } from "@/lib/member-colours";

/** Six swatches. Shown to the person whose colour it is, and to a grown-up
 * for a managed child's profile -- the same rule the rest of that screen
 * already follows. */
export function MemberColourPicker({
  memberId,
  chosen,
}: {
  memberId: string;
  chosen: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = memberColour(memberId, chosen);

  const pick = (colour: string) => {
    setError(null);
    startTransition(async () => {
      const result = await setMemberColourAction(memberId, colour);
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div>
      <div style={{ fontSize: "0.71875rem", letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: "0.375rem" }}>
        CALENDAR COLOUR
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {MEMBER_COLOURS.map((c) => {
          const active = c === current && Boolean(chosen);
          return (
            <button
              key={c}
              type="button"
              disabled={pending}
              onClick={() => pick(c)}
              aria-label={MEMBER_COLOUR_LABEL[c]}
              aria-pressed={active}
              title={MEMBER_COLOUR_LABEL[c]}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: `var(--member-${c})`,
                border: active ? "2px solid var(--color-text)" : "1px solid var(--color-divider)",
                // The ring sits outside the swatch so the colour itself is
                // the same size whether or not it is the chosen one.
                outline: active ? "2px solid var(--color-surface)" : "none",
                outlineOffset: -4,
                cursor: pending ? "default" : "pointer",
                padding: 0,
              }}
            />
          );
        })}
      </div>
      {!chosen && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "6px 0 0" }}>
          Currently {MEMBER_COLOUR_LABEL[current].toLowerCase()}, picked automatically. Choose one to keep it.
        </p>
      )}
      {error && <p style={{ fontSize: "0.75rem", color: "var(--cal-occasion)", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
