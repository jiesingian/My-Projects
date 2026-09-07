/** Shown the instant a tab is tapped, while the server renders the real page.
 *
 * Without a file like this, Next.js has nowhere to hand control back to, so a
 * tap does nothing at all until the whole page has rendered on the server and
 * come back — on a phone that reads as the app being broken rather than busy.
 *
 * It also makes prefetching cheap. The tab bar has seven links, and each one
 * that is prefetched used to render its whole page on the server, auth round
 * trip and all. With a loading boundary here, a prefetch stops at this shell
 * instead. */
export default function Loading() {
  return (
    <div style={{ padding: "20px 20px 12px" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      {/* The hub header's shape: eyebrow, large title, segmented control. Same
          rhythm as the real thing, so nothing jumps when it arrives. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="kin-skeleton" style={{ width: 48, height: 13, borderRadius: 4 }} />
        <span className="kin-skeleton" style={{ width: 86, height: 13, borderRadius: 4, marginLeft: "auto" }} />
      </div>
      <div className="kin-skeleton" style={{ width: "48%", height: 34, borderRadius: 8, margin: "8px 0 14px" }} />
      <div className="kin-skeleton" style={{ width: "100%", height: 32, borderRadius: 9 }} />

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kin-skeleton" style={{ height: 74, borderRadius: 14 }} />
        ))}
      </div>
    </div>
  );
}
