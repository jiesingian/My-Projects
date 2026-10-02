"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { accountNumberForPaste, maskAccountNumber } from "@/lib/wealth";

/** An account number shown the way a banking app shows one: masked to its
 * last four, with Show to read it and Copy to paste it into a bank's app.
 * Copy takes the number without spaces or dashes, which those fields tend
 * to refuse. Only ever rendered with a number the viewer was allowed to
 * read (account_numbers' row-level security). */
export function AccountNumber({ number, label = "Account number" }: { number: string; label?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(accountNumberForPaste(number));
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.9375rem", letterSpacing: ".03em" }} aria-live="polite">
        {shown ? number : maskAccountNumber(number)}
      </span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: "0.375rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={shown ? "Hide account number" : "Show account number"}
          title={shown ? "Hide" : "Show"}
          style={{ minHeight: "1.875rem", minWidth: "1.875rem", padding: "0 0.4375rem", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShown((s) => !s)}
        >
          <Icon name={shown ? "eyeOff" : "eye"} size={15} />
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", display: "inline-flex", alignItems: "center", gap: "0.3125rem" }}
          onClick={copy}
        >
          <Icon name={copied === "yes" ? "check" : "copy"} size={14} />
          {copied === "yes" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}
        </button>
      </span>
    </div>
  );
}

/** The optional number field on the add and edit forms, with who will see
 * it said beside it rather than left to guess. */
export function AccountNumberField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="field" style={{ marginBottom: "0.75rem" }}>
      <label>
        Account number (optional)
        <input
          className="input"
          name="account_number"
          inputMode="text"
          autoComplete="off"
          defaultValue={defaultValue ?? ""}
          placeholder="1234 5678 90"
          maxLength={40}
          style={{ minHeight: "2.625rem" }}
        />
      </label>
      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
        On a private account only you see it. On a joint or shared one, the household’s grown-ups do too — never the children.
      </span>
    </div>
  );
}
