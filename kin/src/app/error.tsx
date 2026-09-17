"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";

/** Root error boundary. Without this, an unhandled error anywhere below it
 * falls through to Next's default screen -- a stack trace or a blank page
 * depending on environment, neither of them this app's. Reset re-renders
 * the segment that threw, which is enough for anything transient (a dropped
 * request, a stale session); anything else, Back to Today is a clean escape
 * that doesn't depend on the broken segment at all. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 22 }}>
      <Blueprint style={{ maxWidth: 360, padding: 28, textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            margin: "0 auto 16px",
            borderRadius: "50%",
            background: "var(--color-accent-100)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="info" size={22} className="text-[var(--color-accent-700)]" />
        </div>
        <h1 style={{ fontSize: 19, marginBottom: 6 }}>Something went wrong</h1>
        <p style={{ fontSize: 13.5, color: "var(--color-neutral-600)", lineHeight: 1.5, margin: "0 0 20px" }}>
          The page hit a snag. It&apos;s usually worth trying again.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={reset}>
            Try again
          </button>
          <Link href="/today" className="btn btn-primary" style={{ flex: 1 }}>
            Back to Today
          </Link>
        </div>
      </Blueprint>
    </div>
  );
}
