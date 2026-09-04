"use client";

import { useDocSelection } from "@/lib/doc-selection-context";
import { DownloadLink } from "@/components/download-link";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/icons";
import { deleteDocFileAction } from "@/lib/actions/documents";

export function DocFileRow({
  id,
  folderId,
  fileName,
  path,
  driveViewLink,
}: {
  id: string;
  folderId: string;
  fileName: string;
  path: string | null;
  driveViewLink: string | null;
}) {
  const ctx = useDocSelection();
  const selectMode = ctx?.selectMode ?? false;
  const selected = ctx?.isSelected(id) ?? false;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectMode ? (
          <button
            type="button"
            onClick={() => ctx?.toggle(id, fileName)}
            style={{ all: "unset", display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer", minHeight: 32 }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                border: "1.5px solid var(--color-divider)",
                background: selected ? "var(--color-accent)" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "none",
              }}
            >
              {selected && <Icon name="check" size={10} className="text-white" />}
            </span>
            <span style={{ fontSize: 13.5 }}>{fileName}</span>
          </button>
        ) : (
          <DownloadLink path={path} fileName={fileName} driveViewLink={driveViewLink} />
        )}
      </div>
      {!selectMode && (
        <DeleteButton label={`Delete ${fileName}`} confirmText={`Delete "${fileName}"? This can't be undone.`} onDelete={() => deleteDocFileAction(id, folderId)} />
      )}
    </div>
  );
}
