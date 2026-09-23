import Link from "next/link";
import type { ReactNode } from "react";

/** The frosted card the whole app is built from — translucent, rounded, and
 * blurring whatever sits behind it. */
export function Blueprint({
  children,
  className,
  style,
  as: Tag = "div",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: "div" | "button";
  onClick?: () => void;
}) {
  const cls = `blueprint ${className ?? ""}`;
  if (Tag === "button") {
    return (
      <button type="button" className={cls} style={{ textAlign: "left", ...style }} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

export function Tag({
  children,
  variant = "neutral",
  className,
}: {
  children: ReactNode;
  variant?: "accent" | "neutral" | "outline";
  className?: string;
}) {
  return (
    <span className={`tag tag-${variant} ${className ?? ""}`}>{children}</span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-2"
      style={{
        font: "600 var(--text-sm)/1 var(--font-heading)",
        letterSpacing: ".02em",
        color: "var(--color-neutral-600)",
      }}
    >
      {children}
    </div>
  );
}

export function EyebrowLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        font: "600 var(--text-sm)/1 var(--font-heading)",
        letterSpacing: ".02em",
        color: "var(--color-accent-700)",
      }}
    >
      {children}
    </span>
  );
}

/** The screen a feature shows before anyone has used it.
 *
 * These were one grey sentence each — "Nothing logged yet." — which is the
 * worst place in the app to say nothing, because it is exactly where someone
 * decides whether Kin is alive or abandoned. An empty state has three jobs:
 * say what belongs here, say why it is worth putting there, and give the one
 * button that starts it. */
export function Empty({
  icon,
  title,
  line,
  action,
}: {
  /** An emoji or short glyph. Kept as a child rather than an icon name so a
   * caller can pass anything without widening the icon set. */
  icon?: ReactNode;
  title: string;
  line: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="kin-empty">
      {icon && <span className="kin-empty-ico">{icon}</span>}
      <div className="kin-empty-title">{title}</div>
      <p className="kin-empty-line">{line}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", letterSpacing: ".04em" }}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
