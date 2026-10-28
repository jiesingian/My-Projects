"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDocFolderAction } from "@/lib/actions/documents";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icons";

/** Delete folder, at the foot of a folder's page (Janine, 27 October). Only
 * an empty folder can go; a full one says what to do first. */
export function DocFolderDeleteButton({ folderId, name, entryCount }: { folderId: string; name: string; entryCount: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-block"
      disabled={busy}
      style={{ minHeight: "2.75rem", fontSize: "0.84375rem", marginTop: "0.5rem", color: "var(--color-danger)" }}
      onClick={async () => {
        if (entryCount > 0) {
          toast.error(`Move or delete its ${entryCount === 1 ? "entry" : `${entryCount} entries`} first, then the folder can be deleted.`);
          return;
        }
        if (!(await confirm({ title: `Delete the ${name} folder?`, description: "It is empty. This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
        setBusy(true);
        const { error } = await deleteDocFolderAction(folderId);
        if (error) {
          setBusy(false);
          toast.error(error);
          return;
        }
        router.replace("/family?seg=documents");
      }}
    >
      <Icon name="trash" size={14} /> Delete folder
    </button>
  );
}
