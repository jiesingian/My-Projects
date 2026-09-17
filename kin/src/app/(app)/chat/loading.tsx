/** Chat has neither a HubHeader nor rows of cards -- a compact header with
 * no segmented control, then a thread of bubbles alternating sides -- so it
 * needs its own shape rather than the shared hub skeleton. Bubble widths
 * and the 28px avatar gutter match .kin-bubble and the thread's own layout
 * (chat-thread.tsx), so nothing resizes when the real messages arrive. */
const BUBBLES: { mine: boolean; width: number }[] = [
  { mine: false, width: 62 },
  { mine: false, width: 40 },
  { mine: true, width: 48 },
  { mine: false, width: 70 },
  { mine: true, width: 34 },
];

export default function Loading() {
  return (
    <div style={{ padding: "18px 22px 8px" }} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div style={{ marginBottom: 18 }}>
        <span className="kin-skeleton" style={{ width: 92, height: 12, borderRadius: 4, marginBottom: 7 }} />
        <span className="kin-skeleton" style={{ width: 140, height: 22, borderRadius: 5, marginBottom: 6 }} />
        <span className="kin-skeleton" style={{ width: 190, height: 11, borderRadius: 4 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BUBBLES.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 8, justifyContent: b.mine ? "flex-end" : "flex-start" }}>
            {!b.mine && <span className="kin-skeleton" style={{ width: 28, height: 28, borderRadius: "50%", flex: "none" }} />}
            <span className="kin-skeleton" style={{ width: `${b.width}%`, maxWidth: 280, height: 34, borderRadius: 18 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
