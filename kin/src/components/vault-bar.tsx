"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lockDocumentsAction } from "@/lib/actions/security";

/** Under an open vault: how long until it locks itself, and a way to lock it
 * now -- for handing the phone to somebody. When the time runs out the page
 * refreshes, and the server shows the lock again. */
export function VaultBar({ expiresAt }: { expiresAt: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const left = expiresAt ? new Date(expiresAt).getTime() - now : null;
  useEffect(() => {
    if (left !== null && left <= 0) router.refresh();
  }, [left, router]);

  // No lock set up means nothing to count down or lock.
  if (!expiresAt || left === null) return null;
  const minutes = Math.max(1, Math.ceil(left / 60_000));

  return (
    <div className="kin-vault-bar">
      <span>
        Locks again in {minutes} min
      </span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ minHeight: "2rem", padding: "0 0.375rem", fontSize: "0.8125rem" }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await lockDocumentsAction();
            router.refresh();
          })
        }
      >
        Lock now
      </button>
    </div>
  );
}
