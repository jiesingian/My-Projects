"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export function DeleteButton({
  onDelete,
  label = "Delete",
  confirmText = "Delete this? This can't be undone.",
  style,
}: {
  onDelete: () => Promise<void>;
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
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        await onDelete();
        router.refresh();
      }}
      style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "inherit", padding: 4, display: "inline-flex", opacity: busy ? 0.5 : 1, ...style }}
    >
      <Icon name="trash" size={14} />
    </button>
  );
}
