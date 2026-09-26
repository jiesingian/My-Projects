"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { scanFlyerAction, addScannedItemsAction } from "@/lib/actions/flyer";
import type { ScannedItem } from "@/lib/flyer-scan";

/** Shrinks a phone photo to at most 1600px on its long side as a JPEG. A
 * 12-megapixel photo is 4-6 MB and reads no better than this; the smaller one
 * uploads in a moment on mobile data. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}

type Row = ScannedItem & { keep: boolean };

/** Photograph a school memo, an invitation or a poster, and get calendar
 * entries back to check before anything is saved. */
export function FlyerScanner() {
  const uid = useId();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [scanning, startScan] = useTransition();
  const [saving, startSave] = useTransition();

  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setRows(null);
    startScan(async () => {
      const form = new FormData();
      try {
        form.set("photo", new File([await shrink(file)], "flyer.jpg", { type: "image/jpeg" }));
      } catch {
        form.set("photo", file);
      }
      const result = await scanFlyerAction(form);
      setError(result.error);
      if (!result.error) setRows(result.items.map((it) => ({ ...it, keep: true })));
    });
    if (input.current) input.current.value = "";
  };

  const edit = (i: number, patch: Partial<Row>) => setRows((r) => r && r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const save = () => {
    const chosen = (rows ?? []).filter((r) => r.keep).map((r) => ({ title: r.title, date: r.date, from: r.from, to: r.to, location: r.location, notes: r.notes }));
    if (chosen.length === 0) return;
    startSave(async () => {
      const result = await addScannedItemsAction(chosen);
      setError(result.error);
      if (!result.error) {
        setRows(null);
        setDone(`Added ${result.added} to the family calendar.`);
        router.refresh();
      }
    });
  };

  const kept = rows?.filter((r) => r.keep).length ?? 0;

  return (
    <section className="kin-scan" aria-labelledby={`${uid}-h`}>
      <div className="kin-scan-head">
        <span className="kin-scan-icon" aria-hidden="true">
          <Icon name="camera" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id={`${uid}-h`}>Scan a flyer or invitation</h3>
          <p>Take a photo of a school memo, invite or poster, or choose one you already have (a screenshot works too). Kin finds the dates and you choose what to add.</p>
        </div>
      </div>
      <input
        ref={input}
        id={`${uid}-file`}
        type="file"
        accept="image/*"
        // No `capture` (26 September): it sends a phone straight to the
        // camera, so an invitation that arrived as a photo or a screenshot
        // could not be chosen. Without it the phone offers Photo Library,
        // Take Photo and Choose File.
        className="sr-only"
        onChange={(e) => pick(e.target.files?.[0])}
        disabled={scanning || saving}
      />
      <label htmlFor={`${uid}-file`} className="btn btn-secondary btn-block" aria-disabled={scanning || saving}>
        {scanning ? "Reading the photo…" : rows ? "Scan another" : "Take or choose a photo"}
      </label>
      {scanning && (
        <div className="kin-scan-reading" aria-hidden="true">
          <span className="kin-skeleton" />
          <span className="kin-skeleton" />
        </div>
      )}
      {error && (
        <p role="alert" className="kin-scan-error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="kin-scan-done">
          <Icon name="check" size={14} /> {done}
        </p>
      )}
      {rows && rows.length > 0 && (
        <>
          <ul className="kin-scan-list">
            {rows.map((r, i) => (
              <li key={i} data-keep={r.keep}>
                <label className="kin-scan-keep">
                  <input type="checkbox" checked={r.keep} onChange={(e) => edit(i, { keep: e.target.checked })} />
                  <span className="sr-only">Add {r.title}</span>
                </label>
                <div className="kin-scan-fields">
                  <input className="input" aria-label="Title" value={r.title} maxLength={150} onChange={(e) => edit(i, { title: e.target.value })} />
                  <div className="kin-scan-when">
                    <input className="input" type="date" aria-label="Date" value={r.date} onChange={(e) => edit(i, { date: e.target.value })} />
                    <input className="input" type="time" aria-label="From" value={r.from} onChange={(e) => edit(i, { from: e.target.value })} />
                    <input className="input" type="time" aria-label="To" value={r.to} onChange={(e) => edit(i, { to: e.target.value })} />
                  </div>
                  {r.location && <div className="kin-scan-meta">{r.location}</div>}
                  {r.notes && <div className="kin-scan-meta">{r.notes}</div>}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary btn-block" disabled={saving || kept === 0} onClick={save}>
            {saving ? "Adding…" : `ADD ${kept} TO THE FAMILY CALENDAR`}
          </button>
        </>
      )}
    </section>
  );
}
