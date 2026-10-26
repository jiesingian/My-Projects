/** The sheet's contents while the add page loads. */
export default function SheetLoading() {
  return (
    <div style={{ padding: "0.5rem var(--gutter) 2rem", display: "grid", gap: "0.875rem" }} aria-busy="true" aria-label="Loading">
      <div className="kin-skeleton" style={{ height: 28, width: "55%", borderRadius: 8 }} />
      <div className="kin-skeleton" style={{ height: 44, borderRadius: 12 }} />
      <div className="kin-skeleton" style={{ height: 44, borderRadius: 12 }} />
      <div className="kin-skeleton" style={{ height: 44, borderRadius: 12, width: "70%" }} />
    </div>
  );
}
