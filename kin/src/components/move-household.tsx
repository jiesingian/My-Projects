"use client";

import { useActionState, useId, useRef } from "react";
import { moveToHouseholdAction, startOwnHouseholdAction } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { ErrorText, SubmitButton } from "@/components/form";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";

const initialState: ActionState = { error: null };

const heading = { font: "600 1.25rem/1.15 var(--font-heading)", display: "block", margin: "9px 0 4px" } as const;
const body = { fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-neutral-700)", display: "block", marginBottom: "0.875rem" } as const;

/** Starting a household of your own, or moving into another one with its
 * code. Used from Settings → Household, and on the page a removed member lands
 * on. Both ask once before doing anything: leaving a household cannot be
 * undone from this side. */
export function MoveHousehold({
  currentHousehold,
  wasRemoved = false,
  canStart = true,
  blocker = null,
}: {
  /** The household they are in now (or were removed from). */
  currentHousehold: string;
  wasRemoved?: boolean;
  /** Only a grown-up starts a household. */
  canStart?: boolean;
  /** Why neither is possible yet -- an organizer with others to hand over to. */
  blocker?: string | null;
}) {
  const [startState, startAction] = useActionState(startOwnHouseholdAction, initialState);
  const [moveState, moveAction] = useActionState(moveToHouseholdAction, initialState);
  const startForm = useRef<HTMLFormElement>(null);
  const moveForm = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const uid = useId();

  // Submit after the confirm sheet says yes. The flag lets the second, real
  // submit through without asking again.
  async function ask(e: React.FormEvent<HTMLFormElement>, form: HTMLFormElement | null, options: Parameters<typeof confirm>[0]) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    e.preventDefault();
    if (!form?.reportValidity()) return;
    if (await confirm(options)) {
      confirmed.current = true;
      form.requestSubmit();
    }
  }

  if (blocker) {
    return (
      <Blueprint style={{ padding: "1rem" }}>
        <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: 0 }}>{blocker}</p>
      </Blueprint>
    );
  }

  const leaving = wasRemoved
    ? "Your journal, notes and personal goals come with you."
    : `You'll leave ${currentHousehold}. It keeps what you shared there — bills, the household journal, the calendar — and your own journal, notes and personal goals come with you.`;

  return (
    <div style={{ display: "grid", gap: "0.875rem" }}>
      {canStart && (
        <form
          ref={startForm}
          action={startAction}
          onSubmit={(e) => {
            const name = String(new FormData(e.currentTarget).get("household_name") ?? "").trim();
            void ask(e, startForm.current, {
              title: `Start ${name || "your household"}?`,
              description: wasRemoved
                ? leaving
                : `${leaving} The two households stay linked, so the family feed and the tree still reach you both.`,
              confirmLabel: "Start household",
            });
          }}
        >
          <Blueprint style={{ padding: "1.25rem" }}>
            <Icon name="housePlus" size={22} className="text-[var(--color-accent-700)]" />
            <span style={heading}>Start your own household</span>
            <span style={body}>
              For when you marry or set up home. You become its organizer, invite your spouse and add your
              children. {wasRemoved ? "" : `You stay linked to ${currentHousehold}.`}
            </span>
            <label htmlFor={`${uid}-name`} style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", display: "block", marginBottom: "0.25rem" }}>
              Household name
            </label>
            <input
              id={`${uid}-name`}
              name="household_name"
              className="input"
              required
              maxLength={100}
              autoComplete="off"
              placeholder="e.g. Santos-Reyes Household"
              style={{ minHeight: "2.75rem", marginBottom: "0.625rem" }}
            />
            <ErrorText message={startState.error} />
            <SubmitButton>Start it</SubmitButton>
          </Blueprint>
        </form>
      )}

      <form
        ref={moveForm}
        action={moveAction}
        onSubmit={(e) =>
          void ask(e, moveForm.current, {
            title: wasRemoved ? "Ask to join that household?" : `Leave ${currentHousehold}?`,
            description: wasRemoved
              ? "They approve you, and your journal, notes and personal goals come with you."
              : `${leaving} You'll wait for the other household to approve you, and you won't see ${currentHousehold} in the meantime.`,
            confirmLabel: wasRemoved ? "Ask to join" : "Leave and ask to join",
            danger: !wasRemoved,
          })
        }
      >
        <Blueprint style={{ padding: "1.25rem" }}>
          <Icon name="keyRound" size={22} className="text-[var(--color-accent-700)]" />
          <span style={heading}>Move into another household</span>
          <span style={body}>Joining your husband&apos;s or wife&apos;s? Enter its six-character invite code.</span>
          <label htmlFor={`${uid}-code`} style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", display: "block", marginBottom: "0.25rem" }}>
            Invite code
          </label>
          <input
            id={`${uid}-code`}
            name="invite_code"
            className="input"
            required
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="ABC-123"
            style={{ minHeight: "2.75rem", marginBottom: "0.625rem", textTransform: "uppercase", letterSpacing: ".08em" }}
          />
          <ErrorText message={moveState.error} />
          <SubmitButton className="btn btn-secondary btn-block">Ask to join</SubmitButton>
        </Blueprint>
      </form>
    </div>
  );
}
