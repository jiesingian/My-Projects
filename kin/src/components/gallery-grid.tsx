"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GalleryTile } from "@/components/gallery-tile";
import { deleteJournalMediaAction } from "@/lib/actions/journal";

type MediaItem = {
  id: string;
  url: string | null;
  viewLink: string | null;
  date: string;
  media_type: string;
};

type Failure = { id: string; date: string; driveViewLink: string | null };

export function GalleryGrid({ media }: { media: MediaItem[] }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<Failure[]>([]);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setFailures([]);
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} item${selected.size > 1 ? "s" : ""}? This can't be undone.`)) return;

    setBusy(true);
    const newFailures: Failure[] = [];
    for (const id of selected) {
      const result = await deleteJournalMediaAction(id);
      if (result.error) {
        const item = media.find((m) => m.id === id);
        newFailures.push({ id, date: item?.date ?? "", driveViewLink: result.driveViewLink ?? null });
      }
    }
    setFailures(newFailures);
    setSelected(new Set());
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button type="button" className="btn btn-secondary" style={{ fontSize: 11, minHeight: 30, padding: "0 12px" }} onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
          {selectMode ? "CANCEL" : "SELECT"}
        </button>
      </div>

      {failures.length > 0 && (
        <div className="blueprint" style={{ padding: 10, marginBottom: 10, fontSize: 11.5 }}>
          <div style={{ marginBottom: 6, color: "var(--color-accent-700)" }}>
            {failures.length} item{failures.length > 1 ? "s" : ""} added directly in Drive — couldn&apos;t be deleted here:
          </div>
          {failures.map((f) => (
            <div key={f.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "var(--color-neutral-700)" }}>{f.date}</span>
              {f.driveViewLink && (
                <a href={f.driveViewLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                  Open in Drive
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: selectMode ? 64 : 0 }}>
        {media.map((m) => (
          <GalleryTile
            key={m.id}
            id={m.id}
            url={m.url}
            viewLink={m.viewLink}
            date={m.date}
            mediaType={m.media_type}
            selectMode={selectMode}
            selected={selected.has(m.id)}
            onToggleSelect={() => toggle(m.id)}
          />
        ))}
      </div>

      {selectMode && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--color-bg)",
            borderTop: "1px solid var(--color-divider)",
            padding: 12,
            display: "flex",
            gap: 10,
            alignItems: "center",
            zIndex: 500,
          }}
        >
          <span style={{ fontSize: 12, flex: 1, color: "var(--color-neutral-700)" }}>{selected.size} selected</span>
          <button type="button" className="btn btn-primary" style={{ minHeight: 36, fontSize: 12, padding: "0 16px" }} disabled={selected.size === 0 || busy} onClick={deleteSelected}>
            {busy ? "DELETING…" : "DELETE"}
          </button>
        </div>
      )}
    </>
  );
}
