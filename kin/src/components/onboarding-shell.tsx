import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

export function OnboardingShell({
  step,
  backHref,
  children,
}: {
  step?: string;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0 1.25rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, paddingTop: "3rem", paddingBottom: "3rem" }}>
        {(backHref || step) && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "2.125rem" }}>
            {backHref ? (
              <Link href={backHref} className="btn btn-secondary btn-icon" aria-label="Back">
                <Icon name="chevronLeft" />
              </Link>
            ) : (
              <span />
            )}
            {step && (
              <span
                style={{
                  font: "600 0.8125rem/1 var(--font-heading)",
                  letterSpacing: ".02em",
                  color: "var(--color-accent-700)",
                  marginLeft: "auto",
                }}
              >
                {step}
              </span>
            )}
          </div>
        )}
        {children}
      </div>
    </main>
  );
}

export function Wordmark() {
  return (
    <div>
      <div
        style={{
          font: "600 0.8125rem/1 var(--font-heading)",
          letterSpacing: ".02em",
          color: "var(--color-accent-700)",
        }}
      >
        YOUR FAMILY, IN ONE PLACE
      </div>
      <div
        style={{
          font: "600 clamp(56px,14vw,92px)/.86 var(--font-heading)",
          letterSpacing: "-.03em",
          margin: "16px 0 0",
        }}
      >
        KIN
      </div>
      {/* The promise Facebook and Instagram cannot make, said once, where a
          new family decides whether to trust the app. */}
      <p style={{ margin: "14px 0 0", fontSize: "0.875rem", lineHeight: 1.45, color: "var(--color-neutral-700)", maxWidth: "24rem" }}>
        Private to your family. No ads, no algorithm, no strangers — only the people you invite.
      </p>
    </div>
  );
}
