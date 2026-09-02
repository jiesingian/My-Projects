import type { ReactNode } from "react";

/** Hairline border + four corner registration marks — the system's signature card. */
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
      <button type="button" className={cls} style={style} onClick={onClick}>
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
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
        font: "600 10px/1 var(--font-heading)",
        letterSpacing: ".16em",
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
        font: "600 10px/1 var(--font-heading)",
        letterSpacing: ".18em",
        color: "var(--color-accent-700)",
      }}
    >
      {children}
    </span>
  );
}
