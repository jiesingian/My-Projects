"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { ErrorText, SubmitButton } from "@/components/form";
import { exportMyDataAction, type ExportResult } from "@/lib/actions/export";

/** "Download my data" in Settings → Account (approved 28 September). A locked
 * door like the vault's: nothing is read until the password is typed and
 * the server has checked it (actions/export.ts). The file is handed to the
 * browser to save; nothing is kept anywhere else. */
export function ExportData() {
  const [state, action] = useActionState<ExportResult, FormData>(exportMyDataAction, { error: null });
  const form = useRef<HTMLFormElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!state.base64 || !state.filename) return;
    const bytes = Uint8Array.from(atob(state.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = state.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    // The password does not stay in the field once it has done its job.
    form.current?.reset();
  }, [state]);

  return (
    <Blueprint style={{ padding: "1rem", marginTop: "1.25rem" }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
        <Icon name="keyRound" size={20} className="text-[var(--color-accent-700)] mt-1" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ font: "600 1.125rem/1.2 var(--font-heading)", margin: 0 }}>Download my data</h3>
          <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0.25rem 0 0.75rem" }}>
            Everything you can see in Kin, as spreadsheets in one ZIP file. It holds your family&rsquo;s health and money
            records, so enter your password first. Vault passwords are not included.
          </p>
        </div>
      </div>
      <form ref={form} action={action}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: "0.75rem" }}>
          <label htmlFor={`${uid}-pw`}>Your Kin password</label>
          <input id={`${uid}-pw`} aria-label="Password" className="input" type="password" name="password" required autoComplete="current-password" />
        </div>
        <SubmitButton className="btn btn-secondary btn-block" style={{ minHeight: "2.75rem" }}>
          Download
        </SubmitButton>
        {state.filename && (
          <p role="status" style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "0.625rem 0 0", display: "flex", gap: "0.375rem", alignItems: "center" }}>
            <Icon name="check" size={14} /> Saved as {state.filename}. Keep it somewhere private.
          </p>
        )}
      </form>
    </Blueprint>
  );
}
