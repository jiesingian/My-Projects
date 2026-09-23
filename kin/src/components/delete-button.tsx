"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";

export function DeleteButton({
  onDelete,
  label = "Delete",
  confirmText = "Delete this? This can't be undone.",
  style,
}: {
  onDelete: () => Promise<{ error: string | null; driveFolderLink?: string | null } | void>;
  label?: string;
  confirmText?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label={label}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!(await confirm({ title: confirmText, confirmLabel: "Delete", danger: true }))) return;
        setBusy(true);
        const result = await onDelete();
        setBusy(false);
        if (result?.error) {
          if (
            result.driveFolderLink &&
            (await confirm({ title: result.error, description: "Open its Drive folder now? Click the file there, then use Drive's own delete icon.", confirmLabel: "Open Drive" }))
          ) {
            window.open(result.driveFolderLink, "_blank", "noopener,noreferrer");
          } else if (!result.driveFolderLink) {
            toast.error(result.error);
          }
          return;
        }
        router.refresh();
      }}
      style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "inherit", padding: "0.25rem", display: "inline-flex", opacity: busy ? 0.5 : 1, ...style }}
    >
      <Icon name="trash" size={14} />
    </button>
  );
}
