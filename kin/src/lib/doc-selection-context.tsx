"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { deleteDocFileAction } from "@/lib/actions/documents";
import { confirm } from "@/components/confirm-sheet";

type Failure = { id: string; fileName: string; driveFolderLink: string | null };

type Ctx = {
  selectMode: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string, fileName: string) => void;
};

const SelectionContext = createContext<Ctx | null>(null);

export function useDocSelection() {
  return useContext(SelectionContext);
}

/** Wraps the documents folder page so "select" mode and the pending
 * selection can be shared across file rows nested under different entries —
 * a plain prop chain would mean threading selection state through every
 * entry card just to reach the file rows a couple levels down. */
export function DocSelectionProvider({ folderId, children }: { folderId: string; children: ReactNode }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [failures, setFailures] = useState<Failure[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function toggle(id: string, fileName: string) {
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(id)) next.delete(id);
      else next.set(id, fileName);
      return next;
    });
  }

  function exit() {
    setSelectMode(false);
    setSelected(new Map());
    setFailures([]);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!(await confirm({ title: `Delete ${selected.size} file${selected.size > 1 ? "s" : ""}?`, description: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;

    setBusy(true);
    const newFailures: Failure[] = [];
    for (const [id, fileName] of selected) {
      const result = await deleteDocFileAction(id, folderId);
      if (result.error) newFailures.push({ id, fileName, driveFolderLink: result.driveFolderLink ?? null });
    }
    setFailures(newFailures);
    setSelected(new Map());
    setBusy(false);
    router.refresh();
  }

  return (
    <SelectionContext.Provider value={{ selectMode, isSelected: (id) => selected.has(id), toggle }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <button type="button" className="btn btn-secondary" style={{ fontSize: "0.8125rem", minHeight: "1.875rem", padding: "0 0.75rem" }} onClick={() => (selectMode ? exit() : setSelectMode(true))}>
          {selectMode ? "Cancel" : "Select"}
        </button>
      </div>

      {failures.length > 0 && (
        <div className="blueprint" style={{ padding: "0.625rem", marginBottom: "0.625rem", fontSize: "0.8125rem" }}>
          <div style={{ marginBottom: "0.375rem", color: "var(--color-accent-700)" }}>
            {failures.length} file{failures.length > 1 ? "s" : ""} added directly in Drive — couldn&apos;t be deleted here:
          </div>
          {failures.map((f) => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.1875rem 0" }}>
              <span style={{ color: "var(--color-neutral-700)" }}>{f.fileName}</span>
              {f.driveFolderLink && (
                <a href={f.driveFolderLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                  Open Drive folder
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ paddingBottom: selectMode ? 64 : 0 }}>{children}</div>

      {selectMode && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--color-bg)",
            borderTop: "1px solid var(--color-divider)",
            padding: "0.75rem",
            display: "flex",
            gap: "0.625rem",
            alignItems: "center",
            zIndex: 500,
          }}
        >
          <span style={{ fontSize: "0.84375rem", flex: 1, color: "var(--color-neutral-700)" }}>{selected.size} selected</span>
          <button type="button" className="btn btn-primary" style={{ minHeight: "2.25rem", fontSize: "0.84375rem", padding: "0 1rem" }} disabled={selected.size === 0 || busy} onClick={deleteSelected}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
    </SelectionContext.Provider>
  );
}
