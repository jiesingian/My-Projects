"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { uploadFileDirect } from "@/lib/upload-client";
import { attachRoutineFileAction, deleteRoutineFileAction, getRoutineFileUrl } from "@/lib/actions/routines";
import type { RoutineAttachment } from "@/lib/queries/routines";
import { confirm } from "@/components/confirm-sheet";

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files that belong to the task itself -- a recipe card, a form, reference
 * instructions -- not to any one completed occurrence, so the same set shows
 * up every time the task comes round. */
export function RoutineAttachments({ routineId, initial }: { routineId: string; initial: RoutineAttachment[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadFileDirect(file, "routine");
      if (uploaded.provider !== "supabase") throw new Error("That file went somewhere unexpected.");
      const result = await attachRoutineFileAction({
        routineId,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
        storagePath: uploaded.storagePath,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setFiles((prev) => [...prev, { id: crypto.randomUUID(), fileName: file.name, mimeType: file.type || null, sizeBytes: file.size, storagePath: uploaded.storagePath }]);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function onOpen(f: RoutineAttachment) {
    const url = await getRoutineFileUrl(f.storagePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError(`"${f.fileName}" couldn't be opened right now.`);
  }

  async function onDelete(f: RoutineAttachment) {
    if (!(await confirm({ title: `Remove "${f.fileName}"?`, description: "This can't be undone.", confirmLabel: "Remove", danger: true }))) return;
    setError(null);
    const result = await deleteRoutineFileAction(f.id);
    if (result.error) setError(result.error);
    else {
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      router.refresh();
    }
  }

  return (
    <div className="field" style={{ marginBottom: 16 }}>
      <label>FILES</label>
      {files.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <Icon name="fileText" size={16} style={{ flex: "none", color: "var(--color-neutral-600)" }} />
              <button
                type="button"
                onClick={() => void onOpen(f)}
                style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--color-text)" }}
              >
                <span style={{ display: "block", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.fileName}</span>
                {f.sizeBytes != null && <span style={{ fontSize: 12, color: "var(--color-neutral-600)" }}>{formatBytes(f.sizeBytes)}</span>}
              </button>
              <button
                type="button"
                aria-label={`Remove ${f.fileName}`}
                onClick={() => void onDelete(f)}
                style={{ flex: "none", background: "none", border: "none", padding: 4, cursor: "pointer", color: "var(--color-neutral-600)" }}
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
        }}
      />
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => input.current?.click()} style={{ minHeight: 40, fontSize: 13 }}>
        {busy ? "UPLOADING…" : "+ ADD FILE"}
      </button>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--cal-occasion)", marginTop: 6 }}>
          {error}
        </p>
      )}
    </div>
  );
}
