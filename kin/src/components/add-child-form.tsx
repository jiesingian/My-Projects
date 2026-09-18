"use client";

import { useActionState, useId, useState } from "react";
import { addManagedChildAction, addChildWithLoginAction } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { Icon } from "@/components/icons";
import { DateInput } from "@/components/date-input";
import { PASSWORD_MIN } from "@/lib/password";

const initialState: ActionState = { error: null };

export function AddChildForm() {
  const [open, setOpen] = useState(false);
  // A child young enough to be written for, or old enough to sign in. The
  // difference is one switch rather than two different places to look.
  const [withLogin, setWithLogin] = useState(false);
  const [state] = useActionState(addManagedChildAction, initialState);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  if (!open) {
    return (
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(true)}>
          ADD CHILD
        </button>
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        const res = withLogin
          ? await addChildWithLoginAction(state, fd)
          : await addManagedChildAction(state, fd);
        setError(res.error);
        if (!res.error) {
          setOpen(false);
          setWithLogin(false);
        }
      }}
      style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}
    >
      <ErrorText message={error ?? state.error} />
      <div className="field" style={{ marginBottom: 12 }}>
        <label htmlFor={`${uid}-full-name`}>CHILD&apos;S NAME</label>
        <input id={`${uid}-full-name`} aria-label="Child's name" className="input" name="full_name" required style={{ minHeight: 44 }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-dob`}>DATE OF BIRTH</label>
          <DateInput id={`${uid}-dob`} aria-label="Date of birth" className="input" name="dob" required style={{ minHeight: 44 }} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-relationship`}>RELATIONSHIP</label>
          <input id={`${uid}-relationship`} aria-label="Relationship" className="input" name="relationship" defaultValue="child" style={{ minHeight: 44 }} />
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={withLogin}
          onChange={(e) => setWithLogin(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
          <strong>Give them their own sign-in.</strong>
          <span style={{ color: "var(--color-neutral-600)", display: "block" }}>
            Leave this off and their profile is written by you, which is right for a small child.
          </span>
        </span>
      </label>

      {withLogin && (
        <>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor={`${uid}-email`}>THEIR EMAIL</label>
            <input id={`${uid}-email`} aria-label="Their email" className="input" type="email" name="email" required autoComplete="off" style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor={`${uid}-password`}>FIRST PASSWORD</label>
            <input
              id={`${uid}-password`}
              aria-label="First password"
              className="input"
              type="password"
              name="password"
              required
              minLength={PASSWORD_MIN}
              autoComplete="new-password"
              style={{ minHeight: 44 }}
            />
          </div>
          <div
            className="blueprint"
            style={{ padding: 12, display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 14, background: "var(--color-accent-100)" }}
          >
            <Icon name="shieldCheck" size={15} className="text-[var(--color-accent-700)] mt-1" />
            <span style={{ fontSize: 13, lineHeight: 1.4 }}>
              You set this password and tell it to them — nothing is emailed, so there is no link
              for a child to find. They can change it later from Settings.
            </span>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE CHILD
        </SubmitButton>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: 42, fontSize: 14 }}
          onClick={() => {
            setOpen(false);
            setWithLogin(false);
            setError(null);
          }}
        >
          CANCEL
        </button>
      </div>
    </form>
  );
}
