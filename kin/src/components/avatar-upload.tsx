"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateAvatarAction } from "@/lib/actions/profile";
import { Avatar } from "@/components/avatar";

export function AvatarUpload({
  familyId,
  memberId,
  avatarUrl,
  initials,
  size = 48,
}: {
  familyId: string;
  memberId: string;
  avatarUrl: string | null;
  initials: string;
  size?: number;
}) {
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
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${familyId}/${memberId}-${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type || undefined });
      if (uploadErr) throw new Error(uploadErr.message);

      const result = await updateAvatarAction(path);
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
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{ all: "unset", cursor: busy ? "default" : "pointer", display: "block", position: "relative" }}
      >
        <Avatar url={avatarUrl} initials={initials} size={size} />
        <span
          style={{
            position: "absolute",
            bottom: -2,
            right: -2,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "var(--color-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "#fff",
            border: "2px solid var(--color-bg)",
          }}
        >
          {busy ? "…" : "+"}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 10.5, marginTop: 4, maxWidth: 200 }}>{error}</p>}
    </div>
  );
}
