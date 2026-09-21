import Link from "next/link";
import { Segmented } from "@/components/segmented";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/format";

/** Which of these a new page reaches for, and when a nested route needs
 * `DetailHeader`'s `trail` prop, is decided in `docs/PAGE_PATTERNS.md` --
 * read that before adding a third header shape here. */
export function HubHeader({
  n,
  title,
  segments,
  dateFormat,
}: {
  n: string;
  title: string;
  segments: { label: string; href: string; active: boolean }[];
  /** The household's own reading of a date. Passed rather than looked up:
   * client forms import DetailHeader from this file, so the module lands in
   * the client bundle and cannot reach the session. */
  dateFormat?: string;
}) {
  return (
    <div style={{ padding: "20px 20px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent)" }}>Hub {n}</span>
        <span style={{ fontSize: 13, color: "var(--color-neutral-600)", marginLeft: "auto" }}>{formatDate(new Date(), dateFormat)}</span>
      </div>
      {/* iOS large title */}
      <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", margin: "2px 0 0" }}>{title}</h2>
      {/* A segmented control with one item has nothing to switch between --
          Journal's merge into a single Entries segment is the first hub to
          hit this, and a lone always-active tab would say less than nothing. */}
      {segments.length > 1 && <Segmented items={segments} />}
    </div>
  );
}

export function DetailHeader({
  backHref,
  eyebrow,
  trail,
}: {
  backHref: string;
  eyebrow: string;
  /** Only for a route nested past one level from its hub, where "back"
   * alone no longer says where you are -- see docs/PAGE_PATTERNS.md. The
   * last crumb is the current page and takes no `href`. */
  trail?: { label: string; href?: string }[];
}) {
  return (
    <div style={{ padding: "18px 20px 0" }}>
      {trail && trail.length > 0 && (
        <nav aria-label="Breadcrumb" style={{ marginBottom: 6 }}>
          <ol style={{ listStyle: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, margin: 0, padding: 0, fontSize: 12.5, color: "var(--color-neutral-600)" }}>
            {trail.map((crumb, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                {i > 0 && <span aria-hidden="true">/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} style={{ color: "inherit", textDecoration: "none" }}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Link href={backHref} className="btn btn-secondary btn-icon" aria-label="Back">
          <Icon name="chevronLeft" />
        </Link>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent)", marginLeft: "auto" }}>{eyebrow}</span>
      </div>
    </div>
  );
}
