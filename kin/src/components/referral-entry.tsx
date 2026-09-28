"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReferrerAction } from "@/lib/actions/offers";

/** A new household's first 14 days: "Did another family invite you?" Their
 * code earns them Kin Plus days (7 now, 30 more if this household
 * subscribes). Asked once, and gone once answered. */
export function ReferralEntry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <p role="status" style={{ fontSize: "0.84375rem", margin: "0 0 1.125rem" }}>
        Thanks — {done} gets Kin Plus days for inviting you.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await setReferrerAction(code);
          if (r.error) setError(r.error);
          else {
            setDone(r.name ?? "They");
            router.refresh();
          }
        });
      }}
      style={{ margin: "0 0 1.125rem", padding: "0.75rem 0.8125rem", borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}
    >
      <label htmlFor="kin-referral" style={{ display: "block", fontSize: "0.84375rem", fontWeight: 600 }}>
        Did another family invite you to Kin?
      </label>
      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.125rem 0 0.5rem" }}>
        Enter their family&rsquo;s code and they get Kin Plus days for it.
      </span>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <input
          id="kin-referral"
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="e.g. 7F3A9C21"
          style={{ minHeight: "2.5rem", flex: 1, minWidth: 0, fontSize: "1rem", letterSpacing: ".06em" }}
        />
        <button type="submit" className="btn btn-secondary" disabled={pending || code.trim().length < 6} style={{ minHeight: "2.5rem" }}>
          Add
        </button>
      </div>
      {error && <div role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </form>
  );
}
