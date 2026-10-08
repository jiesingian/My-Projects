"use client";

import { useState, useTransition } from "react";
import { sealLetterAction } from "@/lib/actions/time-capsules";

type Mode = "now" | "day" | "when";

/** Write back to a letter that opened for you (20261007190000): now, on a
 * day you pick, or "open when...". It goes to the letter's writer only. */
export function WriteBack({ letterId, writerId, writerFirst, today }: { letterId: string; writerId: string; writerFirst: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("now");
  const [day, setDay] = useState("");
  const [occasion, setOccasion] = useState("");
  const [openWhen, setOpenWhen] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="kin-write-back">
        {sent && <p role="status" className="kin-letter-meta" style={{ margin: "0 0 0.375rem" }}>{mode === "now" ? `Sent to ${writerFirst}.` : `Sealed for ${writerFirst}.`}</p>}
        <button type="button" className="btn btn-secondary" style={{ minHeight: "2.25rem" }} onClick={() => { setOpen(true); setSent(false); }}>
          Write back to {writerFirst}
        </button>
      </div>
    );
  }
  const ready = body.trim() && (mode === "now" || (mode === "day" && day > "") || (mode === "when" && openWhen.trim()));
  return (
    <div className="kin-write-back kin-card-sign">
      <div className="kin-letter-mode" role="radiogroup" aria-label="When it reaches them">
        {(["now", "day", "when"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className="chip" data-active={mode === m} onClick={() => setMode(m)} disabled={pending}>
            {m === "now" ? "Now" : m === "day" ? "On a day" : "Open when…"}
          </button>
        ))}
      </div>
      {mode === "day" && (
        <>
          <input className="input" type="date" aria-label="Opens on" min={today} value={day} onChange={(e) => setDay(e.target.value)} disabled={pending} />
          <input className="input" aria-label="The occasion" placeholder={`The occasion — ${writerFirst}'s 60th, a wedding…`} maxLength={80} value={occasion} onChange={(e) => setOccasion(e.target.value)} disabled={pending} />
        </>
      )}
      {mode === "when" && (
        <input className="input" aria-label="Open when…" placeholder="Open when… you miss me" maxLength={120} value={openWhen} onChange={(e) => setOpenWhen(e.target.value)} disabled={pending} />
      )}
      <textarea className="input" aria-label={`Your letter to ${writerFirst}`} placeholder={`Dear ${writerFirst}…`} rows={5} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} disabled={pending} autoFocus />
      <p className="kin-letter-meta" style={{ margin: 0 }}>
        Only {writerFirst} will read it{mode === "now" ? "." : mode === "day" ? ", on that day." : ", when they open it."}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !ready}
          onClick={() =>
            startTransition(async () => {
              const r = await sealLetterAction({
                recipientId: writerId,
                replyTo: letterId,
                opensOn: mode === "now" ? today : mode === "day" ? day : null,
                openWhen: mode === "when" ? openWhen : "",
                occasion: mode === "day" ? occasion : "",
                openToSign: false,
                title: "",
                body,
              });
              setError(r.error);
              if (!r.error) {
                setOpen(false);
                setSent(true);
                setBody("");
                setDay("");
                setOccasion("");
                setOpenWhen("");
              }
            })
          }
        >
          {pending ? "Sending…" : mode === "now" ? "Send" : "Seal it"}
        </button>
      </div>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
    </div>
  );
}
