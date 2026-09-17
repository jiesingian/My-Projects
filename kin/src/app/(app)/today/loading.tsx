/** Today doesn't use HubHeader like the other six tabs -- no segmented
 * control, an avatar stack instead -- so the shared (app)/loading.tsx shape
 * would jump on arrival here specifically. Same rhythm as the real page:
 * eyebrow + large title with the avatar cluster opposite, the briefing as a
 * bordered list of rows, then the hub grid. */
export default function Loading() {
  return (
    <div style={{ padding: "24px 22px 20px" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <span className="kin-skeleton" style={{ width: 100, height: 12, borderRadius: 4, marginBottom: 7 }} />
          <span className="kin-skeleton" style={{ width: 170, height: 27, borderRadius: 6 }} />
        </div>
        <span className="kin-skeleton" style={{ width: 92, height: 27, borderRadius: 14 }} />
      </div>

      <span className="kin-skeleton" style={{ width: 118, height: 12, borderRadius: 4, marginBottom: 9 }} />
      <div style={{ borderRadius: "var(--radius-card)", overflow: "hidden", marginBottom: 26 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="kin-skeleton" style={{ height: 56, borderTop: i > 0 ? "1px solid var(--color-divider)" : undefined }} />
        ))}
      </div>

      <span className="kin-skeleton" style={{ width: 56, height: 12, borderRadius: 4, marginBottom: 9 }} />
      <div className="kin-hubgrid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kin-skeleton" style={{ minHeight: 126, borderRadius: 14 }} />
        ))}
      </div>
    </div>
  );
}
