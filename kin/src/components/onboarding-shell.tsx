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
        FAMILY OPERATING SYSTEM
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
    </div>
  );
}
