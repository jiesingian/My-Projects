/** Settings uses DetailHeader (a back button and an eyebrow, no large title
 * or segmented control) rather than HubHeader, and its body is a profile
 * card followed by several labelled sections -- nothing like the hub rows
 * the shared skeleton assumes. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div style={{ padding: "18px 20px 0", display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span className="kin-skeleton" style={{ width: 38, height: 38, borderRadius: "var(--radius-control)" }} />
        <span className="kin-skeleton" style={{ width: 70, height: 12, borderRadius: 4, marginLeft: "auto" }} />
      </div>

      <div style={{ padding: "0 22px 22px" }}>
        <div className="kin-skeleton" style={{ height: 76, borderRadius: "var(--radius-card)", marginBottom: 22 }} />

        {[130, 150, 110].map((w, i) => (
          <div key={i} style={{ marginBottom: 22 }}>
            <span className="kin-skeleton" style={{ width: w, height: 12, borderRadius: 4, marginBottom: 8 }} />
            <div className="kin-skeleton" style={{ height: 64, borderRadius: "var(--radius-card)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
