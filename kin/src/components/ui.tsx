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
        font: "600 13px/1 var(--font-heading)",
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
        font: "600 13px/1 var(--font-heading)",
        letterSpacing: ".02em",
        color: "var(--color-accent-700)",
      }}
    >
      {children}
    </span>
  );
}
