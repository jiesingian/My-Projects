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
    <div style={{ marginBottom: 20 }}>
      <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", marginBottom: 8 }}>
        ABOUT THE FAMILY
      </div>

      {mode === "view" ? (
        <div>
          <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", color: about ? "var(--color-text)" : "var(--color-neutral-600)", margin: 0 }}>
            {about || "No background added yet."}
          </p>
          {canEdit && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, marginTop: 6, padding: 0 }} onClick={() => setMode("edit")}>
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
            style={{ resize: "vertical", minHeight: 90, fontFamily: "inherit" }}
            disabled={busy}
          />
          {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: 1, minHeight: 38, fontSize: 13.5 }}
              disabled={busy}
              onClick={() => {
                setValue(about ?? "");
                setError(null);
                setMode("view");
              }}
            >
              CANCEL
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1, minHeight: 38, fontSize: 13.5 }}
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
              {busy ? "SAVING…" : "SAVE"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
