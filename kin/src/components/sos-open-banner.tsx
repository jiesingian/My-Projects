import Link from "next/link";
import { Icon } from "@/components/icons";

/** An SOS someone in the household pressed and nobody has resolved
 * (sos_alerts.resolved_at): at the top of Today, above the fold, until it
 * is (23 October). Before, it reached a grown-up only by its push. */
export function SosOpenBanner({ alerts }: { alerts: { id: string; name: string; minutesAgo: number }[] }) {
  if (alerts.length === 0) return null;
  return (
    <div style={{ marginBottom: "1rem" }}>
      {alerts.map((a) => (
        <Link
          key={a.id}
          href={`/today/sos/${a.id}`}
          className="blueprint"
          style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.75rem 0.875rem", marginBottom: "0.5rem", textDecoration: "none", color: "inherit", boxShadow: "inset 3px 0 0 var(--cal-occasion)" }}
        >
          <span className="kin-tile3d" style={{ width: 30, height: 30, flex: "none", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--cal-occasion)", color: "#fff" }}>
            <Icon name="phone" size={16} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", font: "600 0.96875rem/1.2 var(--font-heading)" }}>{a.name} pressed SOS</span>
            <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--cal-occasion-ink)", marginTop: "0.125rem" }}>
              {a.minutesAgo < 1 ? "just now" : a.minutesAgo < 60 ? `${a.minutesAgo} min ago` : `${Math.round(a.minutesAgo / 60)} h ago`} · not yet resolved
            </span>
          </span>
          <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
        </Link>
      ))}
    </div>
  );
}
