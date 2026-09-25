/** Today doesn't use HubHeader like the other six tabs -- no segmented
 * control, an avatar stack instead -- so the shared (app)/loading.tsx shape
 * would jump on arrival here specifically. Same rhythm as the real page:
 * eyebrow + large title with the avatar cluster opposite, the briefing as a
 * bordered list of rows, then the glance tiles and the quick-add row. */
export default function Loading() {
  return (
    <div style={{ padding: "1.5rem 1.375rem 1.25rem" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <span className="kin-skeleton" style={{ width: 100, height: 12, borderRadius: 4, marginBottom: "0.4375rem" }} />
          <span className="kin-skeleton" style={{ width: 170, height: 27, borderRadius: 6 }} />
        </div>
        <span className="kin-skeleton" style={{ width: 92, height: 27, borderRadius: 14 }} />
      </div>

      <span className="kin-skeleton" style={{ width: 118, height: 12, borderRadius: 4, marginBottom: "0.5625rem" }} />
      <div style={{ borderRadius: "var(--radius-card)", overflow: "hidden", marginBottom: "1.625rem" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="kin-skeleton" style={{ height: 56, borderTop: i > 0 ? "1px solid var(--color-divider)" : undefined }} />
        ))}
      </div>

      <span className="kin-skeleton" style={{ width: 80, height: 12, borderRadius: 4, marginBottom: "0.5625rem" }} />
      <div className="kin-glance" style={{ marginBottom: "1.625rem" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kin-skeleton" style={{ minHeight: "4.75rem", borderRadius: "var(--radius-card)" }} />
        ))}
      </div>
      <div className="kin-quick" style={{ margin: 0 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kin-skeleton" style={{ minHeight: "4.25rem", borderRadius: "var(--radius-card)" }} />
        ))}
      </div>
    </div>
  );
}
