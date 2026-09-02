import Link from "next/link";
import { Segmented } from "@/components/segmented";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/format";

export function HubHeader({
  n,
  title,
  segments,
}: {
  n: string;
  title: string;
  segments: { label: string; href: string; active: boolean }[];
}) {
  return (
    <div style={{ padding: "24px 22px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".18em", color: "var(--color-accent-700)" }}>
          HUB {n}
        </span>
        <span style={{ font: "400 9.5px/1 ui-monospace, Menlo, monospace", color: "var(--color-neutral-500)", marginLeft: "auto" }}>
          {formatDate(new Date())}
        </span>
      </div>
      <h2 style={{ fontSize: 32, margin: "6px 0 0" }}>{title}</h2>
      <Segmented items={segments} />
    </div>
  );
}

export function DetailHeader({
  backHref,
  eyebrow,
}: {
  backHref: string;
  eyebrow: string;
}) {
  return (
    <div style={{ padding: "24px 22px 0", display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <Link href={backHref} className="btn btn-secondary btn-icon">
        <Icon name="chevronLeft" />
      </Link>
      <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".18em", color: "var(--color-accent-700)", marginLeft: "auto" }}>
        {eyebrow}
      </span>
    </div>
  );
}
