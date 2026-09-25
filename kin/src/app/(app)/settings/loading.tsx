/** Settings uses DetailHeader (a back button and an eyebrow, no large title
 * or segmented control) rather than HubHeader. Its home is a profile card
 * over three short lists, and each group page is a few labelled blocks, so
 * one shape of card-then-blocks serves the home list and every page under
 * it -- nothing like the hub rows the shared skeleton assumes. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div style={{ padding: "1.125rem 1.25rem 0", display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.875rem" }}>
        <span className="kin-skeleton" style={{ width: 38, height: 38, borderRadius: "var(--radius-control)" }} />
        <span className="kin-skeleton" style={{ width: 70, height: 12, borderRadius: 4, marginLeft: "auto" }} />
      </div>

      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <div className="kin-skeleton" style={{ height: 76, borderRadius: "var(--radius-card)", marginBottom: "1.375rem" }} />

        {[130, 150, 110].map((w, i) => (
          <div key={i} style={{ marginBottom: "1.375rem" }}>
            <span className="kin-skeleton" style={{ width: w, height: 12, borderRadius: 4, marginBottom: "0.5rem" }} />
            <div className="kin-skeleton" style={{ height: 64, borderRadius: "var(--radius-card)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
