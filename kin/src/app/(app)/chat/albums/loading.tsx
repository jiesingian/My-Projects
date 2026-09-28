/** Shaped like the albums page: header, then a grid of square covers. */
export default function Loading() {
  return (
    <div style={{ padding: "1.125rem var(--gutter) 1.375rem" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <span className="kin-skeleton" style={{ width: 80, height: 12, borderRadius: 4, marginBottom: "1rem", display: "block" }} />
      <div className="kin-albums" style={{ marginTop: 0 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="kin-skeleton" style={{ aspectRatio: "1", borderRadius: "0.875rem", display: "block" }} />
        ))}
      </div>
    </div>
  );
}
