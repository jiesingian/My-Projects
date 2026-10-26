"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

/** One row of Today's list, compact (Jonathan, 26 October: the cards "do not
 * utilize space on the right side and expand vertically"): the icon, the
 * title with its line of detail, and the answer -- Done and Skip, Taken,
 * Pay, Undo -- on the right of the same line. A chore, a medicine and
 * anything else due today all take this shape, so the list reads as one.
 *
 * `href` makes the title open its place in Kin; `line` is a second line
 * under the row (an RSVP, an old note, an error), the only time a row grows. */
export function TodayRow({
  href,
  icon,
  tintColor,
  title,
  meta,
  metaStyle,
  struck,
  accent,
  faded,
  actions,
  line,
}: {
  href?: string;
  icon: IconName;
  tintColor: string;
  title: string;
  meta: ReactNode;
  metaStyle?: CSSProperties;
  struck?: boolean;
  /** The 3px edge: green once answered, the warning tint while urgent. */
  accent?: "done" | "urgent" | null;
  faded?: boolean;
  actions: ReactNode;
  line?: ReactNode;
}) {
  const head = (
    <>
      <span className="kin-tile3d kin-today-ico" style={{ backgroundColor: tintColor }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="kin-today-text">
        <span className="kin-today-title" style={{ textDecoration: struck ? "line-through" : undefined }}>
          {title}
        </span>
        <span className="kin-today-meta" style={metaStyle}>
          {meta}
        </span>
      </span>
    </>
  );
  return (
    <div className="kin-today-row" data-accent={accent ?? undefined} style={{ opacity: faded ? 0.78 : 1 }}>
      <div className="kin-today-main">
        {href ? (
          <Link href={href} className="kin-today-link">
            {head}
          </Link>
        ) : (
          <div className="kin-today-link">{head}</div>
        )}
        <div className="kin-today-acts">{actions}</div>
      </div>
      {line}
    </div>
  );
}

const SMALL = { minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem", gap: "0.3125rem" } as const;

/** The answer buttons, sized for the right of a row. On the narrowest
 * phones the word goes and the icon stays (aria-label keeps the name). */
export function RowButton({ kind, label, icon, onClick, disabled, href }: { kind: "primary" | "secondary" | "ghost"; label: string; icon?: IconName; onClick?: () => void; disabled?: boolean; href?: string }) {
  const style = kind === "ghost" ? { minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" } : SMALL;
  const inner = (
    <>
      {icon && <Icon name={icon} size={14} />}
      <span className={icon ? "kin-today-word" : undefined}>{label}</span>
    </>
  );
  if (href)
    return (
      <Link href={href} className={`btn btn-${kind}`} style={style} aria-label={label}>
        {inner}
      </Link>
    );
  return (
    <button type="button" className={`btn btn-${kind}`} style={style} aria-label={label} disabled={disabled} onClick={onClick}>
      {inner}
    </button>
  );
}

/** "Done today", "All taken today", "Waiting for a grown-up": the state a
 * row is in once answered, in the detail line's place. */
export function RowState({ icon, children, tone }: { icon: IconName; children: ReactNode; tone?: "warn" | "strong" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3125rem", fontWeight: 500, color: tone === "warn" ? "var(--cal-occasion)" : tone === "strong" ? "var(--color-neutral-900)" : undefined }}>
      <Icon name={icon} size={13} />
      {children}
    </span>
  );
}
