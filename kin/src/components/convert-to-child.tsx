"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { convertToManagedChildAction } from "@/lib/actions/family";
import { confirm } from "@/components/confirm-sheet";

/** Turns a member who has a login back into a managed child profile.
 *
 * Rare, and not reversible from here — attaching a login again is a separate
 * thing the person themselves has to do — so it asks twice: once by being a
 * quiet link rather than a button, and once in a confirm that says plainly
 * what goes and what stays. What stays is the part people worry about: the
 * profile, the name, everything they are tagged in and every record about
 * them. Only the sign-in goes.
 */
export function ConvertToChild({ memberId, fullName }: { memberId: string; fullName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    const ok = await confirm({
      title: `Turn ${fullName} into a managed child profile?`,
      description:
        "They will no longer be able to sign in, and their account will be removed. Everything about them stays: their profile, their photos, the activities they are tagged in, and every health record. A parent keeps writing it for them. This cannot be undone from here — they would have to sign up again.",
      confirmLabel: "Convert",
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    const result = await convertToManagedChildAction(memberId);
    setBusy(false);
    setError(result.error);
    if (!result.error) router.refresh();
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: 13, padding: 0 }}
        disabled={busy}
        onClick={run}
      >
        {busy ? "…" : "Turn into a managed child profile"}
      </button>
      <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "4px 0 0" }}>
        For someone too young for their own login. Removes their sign-in and keeps everything else.
      </p>
      {/* The action reports a partly-done conversion here too -- the profile
          changed but the sign-in outlived it -- so this is not only failure. */}
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
