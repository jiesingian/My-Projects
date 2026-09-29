/** The chat list: a title, then rows of an icon, a name and a last line --
 * the same shape as .kin-threadrow, so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <div style={{ padding: "1.125rem var(--gutter) 0.5rem" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <span className="kin-skeleton" style={{ width: 48, height: 12, borderRadius: 4, marginBottom: "0.4375rem" }} />
      <span className="kin-skeleton" style={{ width: 170, height: 22, borderRadius: 5, marginBottom: "1rem" }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "center", padding: "0.75rem 0" }}>
          <span className="kin-skeleton" style={{ width: 44, height: 44, borderRadius: "50%", flex: "none" }} />
          <span style={{ flex: 1 }}>
            <span className="kin-skeleton" style={{ width: "45%", height: 14, borderRadius: 4, marginBottom: "0.375rem" }} />
            <span className="kin-skeleton" style={{ width: "75%", height: 11, borderRadius: 4 }} />
          </span>
        </div>
      ))}
    </div>
  );
}
