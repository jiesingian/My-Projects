"use client";

import { deleteDocEntryAction } from "@/lib/actions/documents";
import { DeleteButton } from "@/components/delete-button";

export function DocEntryDeleteButton({ entryId, folderId, hasFiles }: { entryId: string; folderId: string; hasFiles: boolean }) {
  return (
    <DeleteButton
      label="Delete entry"
      confirmText={
        hasFiles
          ? "This entry still has files attached — remove those first, then it can be deleted. Try anyway?"
          : "Delete this entry? This can't be undone."
      }
      onDelete={() => deleteDocEntryAction(entryId, folderId)}
    />
  );
}
