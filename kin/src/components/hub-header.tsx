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
    <div style={{ padding: "20px 20px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent)" }}>Hub {n}</span>
        <span style={{ fontSize: 13, color: "var(--color-neutral-600)", marginLeft: "auto" }}>{formatDate(new Date())}</span>
      </div>
      {/* iOS large title */}
      <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", margin: "2px 0 0" }}>{title}</h2>
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
    <div style={{ padding: "18px 20px 0", display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <Link href={backHref} className="btn btn-secondary btn-icon">
        <Icon name="chevronLeft" />
      </Link>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-accent)", marginLeft: "auto" }}>{eyebrow}</span>
    </div>
  );
}
