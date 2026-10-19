"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  bookDate,
  bookFileName,
  bookPages,
  chooseYearBook,
  coverCrop,
  imagesToPdf,
  MONTHS,
  pagePixels,
  photoGrid,
  wrapText,
  type BookPage,
  type YearBookEntry,
} from "@/lib/year-book";
import { shareOrDownload } from "@/lib/share-file";

const PREVIEW_WIDTH = 360;
const PHOTO_TIMEOUT_MS = 20_000;
const INK = "#1c1c1e";
const SOFT = "#6e6e73";
const ACCENT = "#0062cc";
const STAR = "#b8860b";
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

type Photo = { source: CanvasImageSource; w: number; h: number; close: () => void };

/** A photo, read the way the journal shows it and shrunk to what the page
 * needs, so a book of 12-megapixel photos does not hold them all at once.
 * Null when the phone cannot read it (a HEIC on Android, a Drive file gone):
 * that frame is left out rather than the book failing. */
async function loadPhoto(url: string, longSide: number): Promise<Photo | null> {
  try {
    // A Drive file the server cannot reach would otherwise hold the book up for good.
    const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    if (!res.ok) return null;
    const full = await createImageBitmap(await res.blob());
    const s = Math.min(1, longSide / Math.max(full.width, full.height));
    if (s >= 1) return { source: full, w: full.width, h: full.height, close: () => full.close() };
    const c = document.createElement("canvas");
    c.width = Math.round(full.width * s);
    c.height = Math.round(full.height * s);
    c.getContext("2d")?.drawImage(full, 0, 0, c.width, c.height);
    full.close();
    return { source: c, w: c.width, h: c.height, close: () => {} };
  } catch {
    return null;
  }
}

/** One page, drawn at `w` by `h` pixels. Sizes are fractions of the width,
 * so the preview and the print are the same page at different sizes. */
async function drawPage(ctx: CanvasRenderingContext2D, page: BookPage, w: number, h: number, photo: (url: string) => Promise<Photo | null>) {
  const u = w / 1000;
  const m = 70 * u;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "top";
  const font = (weight: number, size: number) => `${weight} ${size * u}px ${FONT}`;
  const text = (s: string, x: number, y: number, weight: number, size: number, color: string, align: CanvasTextAlign = "left") => {
    ctx.font = font(weight, size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  const measureAt = (weight: number, size: number) => (s: string) => {
    ctx.font = font(weight, size);
    return ctx.measureText(s).width;
  };
  const frame = async (url: string, x: number, y: number, fw: number, fh: number) => {
    const p = await photo(url);
    if (!p) return false;
    const c = coverCrop(p.w, p.h, fw, fh);
    ctx.drawImage(p.source, c.sx, c.sy, c.sw, c.sh, x, y, fw, fh);
    p.close();
    return true;
  };

  if (page.kind === "cover") {
    const photoH = h * 0.6;
    if (!(page.photo && (await frame(page.photo, 0, 0, w, photoH)))) {
      ctx.fillStyle = "#f2f2f7";
      ctx.fillRect(0, 0, w, photoH);
    }
    text(String(page.year), m, photoH + 60 * u, 700, 150, INK);
    const name = wrapText(page.household, w - 2 * m, measureAt(600, 56), 2);
    name.forEach((l, i) => text(l, m, photoH + 240 * u + i * 68 * u, 600, 56, INK));
    text(`${page.count} ${page.count === 1 ? "moment" : "moments"} from our year`, m, photoH + 260 * u + name.length * 68 * u, 400, 32, SOFT);
    return;
  }
  if (page.kind === "month") {
    text(MONTHS[page.month - 1], w / 2, h * 0.44, 700, 110, INK, "center");
    text(String(page.year), w / 2, h * 0.44 + 140 * u, 400, 40, SOFT, "center");
    return;
  }
  if (page.kind === "end") {
    text(page.household, w / 2, h * 0.45, 600, 44, INK, "center");
    text(String(page.year), w / 2, h * 0.45 + 64 * u, 400, 34, SOFT, "center");
    text("Made with Kin", w / 2, h - m - 30 * u, 500, 24, SOFT, "center");
    return;
  }

  const e = page.entry;
  let y = m;
  text(bookDate(e.date).toUpperCase(), m, y, 600, 22, ACCENT);
  y += 44 * u;
  for (const l of wrapText(e.title, w - 2 * m, measureAt(700, 54), 2)) {
    text(l, m, y, 700, 54, INK);
    y += 64 * u;
  }
  if (e.milestone) {
    text(`★ ${e.milestoneOf ? `${e.milestoneOf.split(" ")[0]}'s milestone` : "Milestone"}`, m, y + 4 * u, 600, 28, STAR);
    y += 46 * u;
  }
  y += 16 * u;

  const footer = e.people.length ? 50 * u : 0;
  const noteLines = e.note ? wrapText(e.note, w - 2 * m, measureAt(400, 28), page.photos.length ? 6 : 30) : [];
  const noteH = noteLines.length ? noteLines.length * 40 * u + 28 * u : 0;
  const photoH = page.photos.length ? h - y - m - noteH - footer : 0;
  if (page.photos.length) {
    const cells = photoGrid(page.photos.length);
    const areaW = w - 2 * m;
    const top = y;
    await Promise.all(
      cells.map(async (c, i) => {
        const ok = await frame(page.photos[i], m + c.x * areaW, top + c.y * photoH, c.w * areaW, c.h * photoH);
        if (!ok) {
          ctx.fillStyle = "#f2f2f7";
          ctx.fillRect(m + c.x * areaW, top + c.y * photoH, c.w * areaW, c.h * photoH);
        }
      }),
    );
    y += photoH + 28 * u;
  }
  for (const l of noteLines) {
    text(l, m, y, 400, 28, INK);
    y += 40 * u;
  }
  if (!page.photos.length && !noteLines.length && e.milestone) text("★", w / 2, h * 0.4, 400, 260, STAR, "center");
  if (e.people.length) text(e.people.map((p) => p.split(" ")[0]).join(" · "), m, h - m - 26 * u, 400, 24, SOFT);
}

async function renderPage(page: BookPage, px: { w: number; h: number }, longSide: number, type: "image/jpeg", quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = px.w;
  canvas.height = px.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This phone could not draw the page.");
  await drawPage(ctx, page, px.w, px.h, (url) => loadPhoto(url, longSide));
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This phone could not draw the page."))), type, quality));
}

/** Pick the year, untick what should stay out, look at the pages, and save
 * the PDF. Everything happens here, on the phone; nothing is uploaded. */
export function YearBookMaker({ household, years, year, entries }: { household: string; years: number[]; year: number; entries: YearBookEntry[] }) {
  const initial = useMemo(() => chooseYearBook(entries, year), [entries, year]);
  const [selected, setSelected] = useState<Set<string>>(initial.selected);
  const [previews, setPreviews] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const chosen = initial.entries.filter((e) => selected.has(e.id));
  const pages = bookPages(household, year, chosen);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreviews(null);
    setDone(null);
  };

  const preview = async () => {
    const mine = ++run.current;
    setError(null);
    setBusy("Drawing the pages…");
    const px = { w: PREVIEW_WIDTH, h: Math.round((PREVIEW_WIDTH * 297) / 210) };
    const urls: string[] = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        if (run.current !== mine) return;
        setBusy(`Drawing page ${i + 1} of ${pages.length}…`);
        urls.push(URL.createObjectURL(await renderPage(pages[i], px, 500, "image/jpeg", 0.8)));
      }
      previews?.forEach((p) => URL.revokeObjectURL(p));
      setPreviews(urls);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The preview could not be drawn.");
    } finally {
      if (run.current === mine) setBusy(null);
    }
  };

  const make = async () => {
    const mine = ++run.current;
    setError(null);
    setDone(null);
    const px = pagePixels();
    const out: { jpeg: Uint8Array; px: { w: number; h: number } }[] = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        if (run.current !== mine) return;
        setBusy(`Making page ${i + 1} of ${pages.length}…`);
        const blob = await renderPage(pages[i], px, 1800, "image/jpeg", 0.88);
        out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), px });
      }
      const pdf = imagesToPdf(out);
      const file = new File([pdf as BlobPart], bookFileName(household, year), { type: "application/pdf" });
      const how = await shareOrDownload(file, { title: `${household} · ${year}` });
      setDone(how === "shared" ? "Shared." : `Saved as “${file.name}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The book could not be made.");
    } finally {
      if (run.current === mine) setBusy(null);
    }
  };

  return (
    <div className="kin-yearbook">
      {years.length > 1 && (
        <nav className="kin-journal-filter" aria-label="Year">
          {years.map((y) => (
            <Link key={y} href={`/journal/year-book?year=${y}`} className="chip" data-active={y === year} aria-current={y === year ? "page" : undefined}>
              {y}
            </Link>
          ))}
        </nav>
      )}

      {initial.entries.length === 0 ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", lineHeight: 1.5 }}>
          Nothing for {year} yet. Mark a day with a ★ or add photos to an entry in the household journal, and it shows here.
        </p>
      ) : (
        <>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0.75rem", lineHeight: 1.45 }}>
            Every ★ milestone is ticked, and the entries the family loved most. Untick anything that should stay out. {chosen.length} of {initial.entries.length} ticked · {pages.length} pages.
          </p>
          <ul className="kin-yearbook-list">
            {initial.entries.map((e) => (
              <li key={e.id}>
                <label>
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  {e.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a signed or Drive link, not a static asset
                    <img src={e.photos[0]} alt="" loading="lazy" />
                  ) : (
                    <span className="kin-yearbook-nophoto" aria-hidden="true">★</span>
                  )}
                  <span>
                    <span className="kin-yearbook-date">{bookDate(e.date)}</span>
                    <span className="kin-yearbook-title">
                      {e.milestone && <span aria-label="Milestone">★ </span>}
                      {e.title}
                    </span>
                    <span className="kin-yearbook-meta">{e.photos.length === 1 ? "1 photo" : `${e.photos.length} photos`}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", margin: "1rem 0 0.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={preview} disabled={!!busy || chosen.length === 0}>
              Preview
            </button>
            <button type="button" className="btn btn-primary" onClick={make} disabled={!!busy || chosen.length === 0}>
              Make the PDF
            </button>
          </div>
          <p role="status" style={{ fontSize: "0.8125rem", color: error ? "var(--color-danger)" : "var(--color-neutral-600)", minHeight: "1.2em", margin: 0 }}>
            {error ?? busy ?? done ?? ""}
          </p>

          {previews && (
            <div className="kin-yearbook-pages" aria-label="Preview of the pages">
              {previews.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- drawn on the phone just now
                <img key={src} src={src} alt={`Page ${i + 1}`} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
