/** Planner's header matches every other hub (HubHeader + segmented control,
 * same as the shared skeleton), but Calendar -- its default tab -- opens on
 * a horizontal date rail before the day's agenda, which the generic rows
 * skeleton doesn't show. */
export default function Loading() {
  return (
    <div style={{ padding: "20px 20px 12px" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="kin-skeleton" style={{ width: 48, height: 13, borderRadius: 4 }} />
        <span className="kin-skeleton" style={{ width: 86, height: 13, borderRadius: 4, marginLeft: "auto" }} />
      </div>
      <div className="kin-skeleton" style={{ width: "48%", height: 34, borderRadius: 8, margin: "8px 0 14px" }} />
      <div className="kin-skeleton" style={{ width: "100%", height: 32, borderRadius: 9 }} />

      <div style={{ display: "flex", gap: 6, margin: "18px 0" }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="kin-skeleton" style={{ flex: 1, height: 58, borderRadius: 12 }} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="kin-skeleton" style={{ height: 64, borderRadius: 14 }} />
        ))}
      </div>
    </div>
  );
}
