"use client";

import { useEffect, useState } from "react";

/** `clickable` opts a caller out when it already wraps the avatar in its
 * own click handler -- the profile editor opens a full album (set-active,
 * delete) rather than this plain full-screen view, and nesting this
 * component's own click target inside that button would fire both. */
export function Avatar({
  url,
  initials,
  label,
  size = 44,
  clickable = true,
}: {
  url: string | null;
  initials: string;
  label: string;
  size?: number;
  clickable?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (url) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`${label}'s photo`}
          onClick={clickable ? () => setOpen(true) : undefined}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
            border: "1px solid var(--color-divider)",
            flex: "none",
            cursor: clickable ? "zoom-in" : undefined,
          }}
        />
        {open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${label}'s photo`}
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", color: "#fff", fontSize: "1.875rem", lineHeight: 1, cursor: "pointer" }}
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${label}'s photo`}
              style={{ width: 240, height: 240, borderRadius: "50%", objectFit: "cover", border: "2px solid #fff" }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }
  return (
    <span
      className="placeholder-fill"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        border: "1px solid var(--color-divider)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: `600 ${Math.round(size * 0.34)}px/1 var(--font-heading)`,
        color: "var(--color-neutral-700)",
      }}
    >
      {initials}
    </span>
  );
}
