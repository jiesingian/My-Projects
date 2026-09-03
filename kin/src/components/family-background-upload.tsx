"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateFamilyBackgroundAction } from "@/lib/actions/family";

export function FamilyBackgroundUpload({ familyId, backgroundUrl, canEdit }: { familyId: string; backgroundUrl: string | null; canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onFileChange() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = `${familyId}/household-bg-${Date.now()}.${file.name.split(".").pop() ?? "jpg"}`;
      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (uploadErr) throw new Error(uploadErr.message);

      const result = await updateFamilyBackgroundAction(path);
      if (result.error) throw new Error(result.error);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      style={{
        position: "relative",
        height: 120,
        borderRadius: 4,
        overflow: "hidden",
        marginBottom: 14,
        background: backgroundUrl ? `center/cover no-repeat url(${backgroundUrl})` : "var(--color-neutral-200)",
        border: "1px solid var(--color-divider)",
      }}
    >
      {canEdit && (
        <>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ position: "absolute", bottom: 8, right: 8, minHeight: 32, fontSize: 11, padding: "0 12px" }}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "UPLOADING…" : backgroundUrl ? "CHANGE PHOTO" : "ADD HOUSEHOLD PHOTO"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
        </>
      )}
      {error && (
        <div style={{ position: "absolute", left: 8, bottom: 8, fontSize: 11, color: "#fff", background: "var(--color-accent-700)", padding: "3px 8px", borderRadius: 3 }}>
          {error}
        </div>
      )}
    </div>
  );
}
