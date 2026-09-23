import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Offline · Kin" };

// Static on purpose: the service worker fetches this at install time, and a
// fallback that needs a server to render is not a fallback.
export const dynamic = "force-static";

/** Shown when a page was asked for that is not cached and there is no
 * network. Deliberately plain: it is outside the (app) layout, because that
 * layout loads the member and the household, which is exactly the thing
 * that cannot happen right now. */
export default function OfflinePage() {
  return (
    <div style={{ padding: "3rem 1.375rem", maxWidth: 420, margin: "0 auto" }}>
      <Blueprint style={{ padding: "1.375rem 1.125rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.5rem" }}>
          <Icon name="info" size={18} style={{ color: "var(--color-accent-700)" }} />
          <h1 style={{ font: "600 1.25rem/1.2 var(--font-heading)", margin: 0 }}>No connection</h1>
        </div>

        <p style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-neutral-800)", margin: "0 0 14px" }}>
          The shopping list and the calendar work offline if you&rsquo;ve opened them on this device before. Other
          screens need the network.
        </p>

        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 14px" }}>
          <strong>Changes don&rsquo;t save while you&rsquo;re offline.</strong> Ticking something off now would look
          like it worked and then quietly vanish, so Kin doesn&rsquo;t pretend — it waits until you&rsquo;re back.
        </p>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a href="/household?seg=buy" className="btn btn-primary" style={{ minHeight: "2.375rem", fontSize: "0.84375rem", padding: "0 0.875rem" }}>
            The list
          </a>
          <a href="/planner" className="btn btn-secondary" style={{ minHeight: "2.375rem", fontSize: "0.84375rem", padding: "0 0.875rem" }}>
            The calendar
          </a>
        </div>
      </Blueprint>
    </div>
  );
}
