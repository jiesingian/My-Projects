/** Loading shapes for the screens the shared hub skeleton in
 * app/(app)/loading.tsx does not look like. Each matches the rhythm of the
 * screen it stands in for -- a back button and title, then what the page is
 * made of -- so nothing jumps when the real content lands. */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div style={{ padding: "1.125rem 1.25rem 0", display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.875rem" }}>
        <span className="kin-skeleton" style={{ width: 38, height: 38, borderRadius: "var(--radius-control)" }} />
        <span className="kin-skeleton" style={{ width: 70, height: 12, borderRadius: 4, marginLeft: "auto" }} />
      </div>
      <div style={{ padding: "0 1.375rem 1.375rem" }}>{children}</div>
    </div>
  );
}

/** A form: a title, then labelled fields, then the save button. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Shell>
      <div className="kin-skeleton" style={{ width: "55%", height: 30, borderRadius: 8, marginBottom: "1.25rem" }} />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} style={{ marginBottom: "1rem" }}>
          <span className="kin-skeleton" style={{ width: 90, height: 11, borderRadius: 4, marginBottom: "0.4375rem" }} />
          <div className="kin-skeleton" style={{ height: 46, borderRadius: "var(--radius-control)" }} />
        </div>
      ))}
      <div className="kin-skeleton" style={{ height: 48, borderRadius: "var(--radius-control)", marginTop: "0.5rem" }} />
    </Shell>
  );
}

/** One thing and what belongs to it: a summary card, then a list. */
export function DetailSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.25rem" }}>
        <span className="kin-skeleton" style={{ width: 56, height: 56, borderRadius: "50%", flex: "none" }} />
        <div style={{ flex: 1 }}>
          <div className="kin-skeleton" style={{ width: "60%", height: 22, borderRadius: 6, marginBottom: "0.5rem" }} />
          <div className="kin-skeleton" style={{ width: "35%", height: 12, borderRadius: 4 }} />
        </div>
      </div>
      <div className="kin-skeleton" style={{ height: 88, borderRadius: "var(--radius-card)", marginBottom: "1.25rem" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="kin-skeleton" style={{ height: 52, borderRadius: 12 }} />
        ))}
      </div>
    </Shell>
  );
}

/** The journal: posts with a byline and a photo. */
export function FeedSkeleton() {
  return (
    <div style={{ padding: "1.25rem 1.25rem 0.75rem" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="kin-skeleton" style={{ width: "48%", height: 34, borderRadius: 8, margin: "21px 0 14px" }} />
      <div className="kin-skeleton" style={{ width: "100%", height: 32, borderRadius: 9, marginBottom: "1.125rem" }} />
      {[0, 1].map((i) => (
        <div key={i} style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.625rem" }}>
            <span className="kin-skeleton" style={{ width: 36, height: 36, borderRadius: "50%" }} />
            <span className="kin-skeleton" style={{ width: 120, height: 12, borderRadius: 4 }} />
          </div>
          <div className="kin-skeleton" style={{ aspectRatio: "4 / 3", borderRadius: "var(--radius-card)", marginBottom: "0.625rem" }} />
          <div className="kin-skeleton" style={{ width: "80%", height: 12, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
