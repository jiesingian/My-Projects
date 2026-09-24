"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateFamilyAboutAction } from "@/lib/actions/family";

export function FamilyAboutEditor({ about, canEdit }: { about: string | null; canEdit: boolean }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [value, setValue] = useState(about ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
        ABOUT THE FAMILY
      </div>

      {mode === "view" ? (
        <div>
          <p style={{ fontSize: "0.8125rem", lineHeight: 1.5, whiteSpace: "pre-wrap", color: about ? "var(--color-text)" : "var(--color-neutral-600)", margin: 0 }}>
            {about || "No background added yet."}
          </p>
          {canEdit && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8125rem", marginTop: "0.375rem", padding: 0 }} onClick={() => setMode("edit")}>
              Edit
            </button>
          )}
        </div>
      ) : (
        <div>
          <textarea
            className="input"
            rows={4}
            placeholder="Share a bit of your family's story, values, or history…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ resize: "vertical", minHeight: "5.625rem", fontFamily: "inherit" }}
            disabled={busy}
          />
          {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.84375rem" }}
              disabled={busy}
              onClick={() => {
                setValue(about ?? "");
                setError(null);
                setMode("view");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.84375rem" }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await updateFamilyAboutAction(value);
                setBusy(false);
                if (result.error) setError(result.error);
                else {
                  setMode("view");
                  router.refresh();
                }
              }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
