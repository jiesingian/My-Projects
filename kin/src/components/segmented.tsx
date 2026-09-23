import Link from "next/link";

export function Segmented({
  items,
}: {
  items: { label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="seg" style={{ marginTop: "0.875rem" }}>
      {items.map((it) => (
        <Link key={it.label} href={it.href} data-active={it.active}>
          {it.label}
        </Link>
      ))}
    </div>
  );
}

export function ChipRow({
  items,
}: {
  items: { label: string; href: string; active: boolean }[];
}) {
  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
      {/* Keyed on href, not label: two family members can share a first name. */}
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="chip" data-active={it.active}>
          {it.label}
        </Link>
      ))}
    </div>
  );
}
