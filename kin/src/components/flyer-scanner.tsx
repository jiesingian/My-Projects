"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { PhotoViewer } from "@/components/photo-viewer";
import { scanFlyerAction, addScannedItemsAction, scanSentScreenshotAction } from "@/lib/actions/flyer";
import { KIN_AI_PRIVACY } from "@/lib/kin-ai";
import type { ScannedItem } from "@/lib/flyer-scan";
import { shrink } from "@/lib/shrink-photo";

type Row = ScannedItem & { keep: boolean };

/** Photograph a school memo, an invitation or a poster, and get calendar
 * entries back to check before anything is saved.
 *
 * `sent` is a screenshot a Shortcut left waiting ("Send it to Kin",
 * lib/send-to-kin.ts): it is read once on arrival and lands on the same
 * review list. "Paste a screenshot" reads the clipboard's image into the
 * same scan. Both are Kin Plus; `plus` says whether this household has it. */
export function FlyerScanner({ ready, sent, plus }: { ready: boolean; sent?: string | null; plus?: boolean }) {
  const uid = useId();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [scanning, startScan] = useTransition();
  const [saving, startSave] = useTransition();
  const [plusNote, setPlusNote] = useState(false);

  // A screenshot sent from the share sheet: read it as soon as the page is
  // open, once. The action deletes it whether or not dates were found.
  const sentOnce = useRef<string | null>(null);
  useEffect(() => {
    if (!sent || sentOnce.current === sent) return;
    sentOnce.current = sent;
    setError(null);
    setDone(null);
    startScan(async () => {
      const result = await scanSentScreenshotAction(sent);
      setError(result.error);
      if (!result.error) setRows(result.items.map((it) => ({ ...it, keep: true })));
    });
    // The id is dropped from the address so a refresh or Back does not try
    // a screenshot that is gone.
    const url = new URL(window.location.href);
    url.searchParams.delete("sent");
    router.replace(url.pathname + url.search, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per sent id
  }, [sent]);

  // "Paste a screenshot": the clipboard's image, read like a chosen photo.
  const paste = async () => {
    if (!plus) {
      setPlusNote(true);
      return;
    }
    setError(null);
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        pick(new File([blob], "pasted.png", { type }));
        return;
      }
      setError("Nothing to paste: copy a screenshot first (press and hold it, Copy).");
    } catch {
      setError("This browser won't let Kin read the clipboard. Choose the screenshot from Photos instead.");
    }
  };

  // Until scanning is switched on, the chosen photo is shown here to copy
  // from while filling in the event below (26 September). It stays on the
  // phone: nothing is uploaded or saved.
  const [preview, setPreview] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!ready) {
      setPreview(URL.createObjectURL(file));
      if (input.current) input.current.value = "";
      return;
    }
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
        {scanning ? "Reading the photo…" : rows || preview ? (ready ? "Scan another" : "Choose another photo") : "Take or choose a photo"}
      </label>
      {ready && (
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: "0.5rem" }} onClick={() => void paste()} disabled={scanning || saving}>
          Paste a screenshot
        </button>
      )}
      {plusNote && (
        <p className="kin-scan-off" role="note" style={{ marginTop: "0.5rem" }}>
          Reading a screenshot you paste, or send from the share sheet, is part of Kin Plus. Choosing a photo above still works on Kin Free (five a month).
        </p>
      )}
      {ready && <p className="kin-scan-privacy">{KIN_AI_PRIVACY}</p>}
      {!ready && (
        // Said up front: until the key is added, the photo can be looked at
        // but not read for dates.
        <p className="kin-scan-off" role="note">
          Reading the dates by itself isn&apos;t switched on yet. Until then your photo shows here so
          you can copy the details into the event below.
        </p>
      )}
      {preview && (
        <button type="button" className="kin-scan-preview" onClick={() => setViewing(true)} aria-label="Open the photo full screen">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a static asset */}
          <img src={preview} alt="The flyer or invitation you chose" />
        </button>
      )}
      {viewing && preview && <PhotoViewer items={[{ url: preview, alt: "Flyer or invitation" }]} onClose={() => setViewing(false)} label="Photo" />}
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
