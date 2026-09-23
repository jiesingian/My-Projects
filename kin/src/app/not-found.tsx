import Link from "next/link";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";

/** Next's default 404 is a blank page with system type -- the one screen in
 * the app that would look like nothing built it. This is the same card
 * shell every empty state already uses, so a wrong link fails in the app's
 * own voice instead of falling out of it. */
export default function NotFound() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.375rem" }}>
      <Blueprint style={{ maxWidth: 360, padding: "1.75rem", textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            margin: "0 auto 16px",
            borderRadius: "50%",
            background: "color-mix(in srgb, var(--color-text) 6%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="info" size={22} className="text-[var(--color-neutral-600)]" />
        </div>
        <h1 style={{ fontSize: "1.1875rem", marginBottom: "0.375rem" }}>Nothing here</h1>
        <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", lineHeight: 1.5, margin: "0 0 20px" }}>
          This page doesn&apos;t exist, or the link is out of date.
        </p>
        <Link href="/today" className="btn btn-primary btn-block">
          Back to Today
        </Link>
      </Blueprint>
    </div>
  );
}
