"use client";

import { useState, useTransition } from "react";
import { sealLetterAction } from "@/lib/actions/time-capsules";
import { readableDay } from "@/lib/time";

export type LetterRecipient = { id: string; name: string; eighteenth: string | null };

/** Write a letter for someone's special day: who it's for, the day it
 * opens (their 18th birthday unless another day is picked), the occasion's
 * name -- which is how the journal gathers everyone's letters for that day
 * together -- and the letter. */
export function LetterForm({ recipients, today }: { recipients: LetterRecipient[]; today: string }) {
  const [recipientId, setRecipientId] = useState("");
  const [opensOn, setOpensOn] = useState("");
  const [occasion, setOccasion] = useState("");
  const [openToSign, setOpenToSign] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const who = recipients.find((r) => r.id === recipientId);
  // Their 18th birthday is the default only while it is still ahead.
  const eighteenth = who?.eighteenth && who.eighteenth > today ? who.eighteenth : null;
  const needsDate = !!who && !eighteenth && !opensOn;

  const seal = () =>
    startTransition(async () => {
      const r = await sealLetterAction({ recipientId, opensOn: opensOn || null, occasion, openToSign, title, body });
      setError(r.error);
      if (!r.error) {
        setRecipientId("");
        setOpensOn("");
        setOccasion("");
        setOpenToSign(true);
        setTitle("");
        setBody("");
        setDone(true);
      }
    });

  return (
    <div style={{ display: "grid", gap: "0.625rem" }}>
      <label style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}>
        For
        <select className="input" value={recipientId} onChange={(e) => { setRecipientId(e.target.value); setDone(false); }} disabled={pending}>
          <option value="">Choose someone…</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}>
        Opens on
        <input className="input" type="date" min={today} value={opensOn} onChange={(e) => setOpensOn(e.target.value)} disabled={pending} />
        {who && !opensOn && (
          <span style={{ color: "var(--color-neutral-700)" }}>
            {eighteenth ? `Leave empty to open it on their 18th birthday, ${readableDay(eighteenth, { year: true })}.` : "Pick a day — there's no 18th birthday ahead to open it on."}
          </span>
        )}
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: "0.8125rem" }}>
        The occasion
        <input className="input" placeholder={eighteenth && !opensOn ? "18th birthday" : "Birthday, graduation, wedding day…"} maxLength={80} value={occasion} onChange={(e) => setOccasion(e.target.value)} disabled={pending} />
      </label>
      <input className="input" aria-label="Title (optional)" placeholder="Title (optional)" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} />
      <textarea className="input" aria-label="Your letter" placeholder="Dear…" rows={8} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} disabled={pending} />
      <label className="kin-letter-switch">
        <input type="checkbox" checked={openToSign} onChange={(e) => setOpenToSign(e.target.checked)} disabled={pending} />
        <span>
          Let the family sign it too
          <span className="kin-letter-meta">
            {openToSign
              ? "It becomes a card: the family is told and can add their own notes. They see who signed, never what anyone wrote."
              : "Private: just from you. Nobody else is told it exists."}
          </span>
        </span>
      </label>
      <p style={{ fontSize: "0.8125rem", margin: 0, color: "var(--color-neutral-700)" }}>
        Until the day it opens they only see a sealed envelope. On the day it opens for them in the journal — only they and each writer can read it.
      </p>
      <button type="button" className="btn btn-primary" disabled={pending || !recipientId || !body.trim() || needsDate} onClick={seal}>
        {pending ? "Sealing…" : "Seal the letter"}
      </button>
      {done && <p role="status" style={{ fontSize: "0.8125rem", margin: 0 }}>Sealed. It&apos;s safe here until the day it opens.</p>}
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
    </div>
  );
}
