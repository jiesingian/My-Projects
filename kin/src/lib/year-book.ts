import { readableDay } from "@/lib/time";

/** The year book (19 October, Kin Plus): a print-ready PDF of a household's
 * year -- its ★ milestones and the entries with the best photos -- to print
 * at a local shop or a photobook service. No print partner.
 *
 * Everything here is pure, so the phone and the tests share it: which entries
 * go in, how a page is laid out, and the PDF file itself. The pages are drawn
 * on the phone (year-book-maker.tsx) from what the viewer can already read --
 * row-level security chose the entries before they reached the page -- and the
 * file is never stored, so it costs no storage.
 *
 * The PDF is written here rather than by a library: every page is one JPEG
 * drawn on a canvas, and a PDF that holds one image per page is a few objects
 * and an index. Drawing the words on the canvas too means any name, accent or
 * emoji prints exactly as it shows in Kin, with no fonts to embed. */

export type YearBookEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  note: string | null;
  milestone: boolean;
  milestoneOf: string | null;
  people: string[];
  photos: string[]; // urls, best first
  reactions: number;
};

/** A4 portrait, the size every local print shop and photobook service takes. */
export const PAGE_MM = { w: 210, h: 297 } as const;
/** 200 dots per inch: sharp in print, and a 60-page book stays a file a
 * phone can hold and share. */
export const PRINT_DPI = 200;
export const MAX_PHOTOS_PER_PAGE = 4;
/** Entries chosen for the photos alone, after every milestone. */
export const DEFAULT_PHOTO_ENTRIES = 40;

export function pagePixels(dpi = PRINT_DPI): { w: number; h: number } {
  return { w: Math.round((PAGE_MM.w / 25.4) * dpi), h: Math.round((PAGE_MM.h / 25.4) * dpi) };
}

/** The years a household has entries in, newest first. */
export function bookYears(dates: string[]): number[] {
  return [...new Set(dates.map((d) => Number(d.slice(0, 4))).filter((y) => y > 1900))].sort((a, b) => b - a);
}

/** The entries of one year a book starts with, in date order, and which of
 * them are ticked to begin with. Every ★ milestone is in and ticked; of the
 * rest only entries with a photo are offered, and the ones the family reacted
 * to most (then with the most photos) are ticked, up to `photoEntries`. The
 * person can untick anything; nothing unticked goes in. */
export function chooseYearBook(entries: YearBookEntry[], year: number, photoEntries = DEFAULT_PHOTO_ENTRIES): { entries: YearBookEntry[]; selected: Set<string> } {
  const ofYear = entries.filter((e) => e.date.startsWith(`${year}-`) && (e.milestone || e.photos.length > 0));
  const selected = new Set(ofYear.filter((e) => e.milestone).map((e) => e.id));
  const best = ofYear
    .filter((e) => !e.milestone)
    .sort((a, b) => b.reactions - a.reactions || b.photos.length - a.photos.length || a.date.localeCompare(b.date));
  for (const e of best.slice(0, Math.max(0, photoEntries))) selected.add(e.id);
  return { entries: [...ofYear].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)), selected };
}

export type BookPage =
  | { kind: "cover"; household: string; year: number; count: number; photo: string | null }
  | { kind: "month"; month: number; year: number }
  | { kind: "entry"; entry: YearBookEntry; photos: string[] }
  | { kind: "end"; household: string; year: number };

/** The book's pages: a cover (the first milestone's photo, else the first
 * photo), a divider for each month that has something, one page per entry
 * with up to four of its photos, and a last page. */
export function bookPages(household: string, year: number, chosen: YearBookEntry[]): BookPage[] {
  const sorted = [...chosen].sort((a, b) => a.date.localeCompare(b.date));
  const cover = sorted.find((e) => e.milestone && e.photos.length > 0)?.photos[0] ?? sorted.find((e) => e.photos.length > 0)?.photos[0] ?? null;
  const pages: BookPage[] = [{ kind: "cover", household, year, count: sorted.length, photo: cover }];
  let month = 0;
  for (const e of sorted) {
    const m = Number(e.date.slice(5, 7));
    if (m !== month) {
      pages.push({ kind: "month", month: m, year });
      month = m;
    }
    pages.push({ kind: "entry", entry: e, photos: e.photos.slice(0, MAX_PHOTOS_PER_PAGE) });
  }
  pages.push({ kind: "end", household, year });
  return pages;
}

/** Where each photo sits in the photo area of an entry page, as fractions of
 * that area: one fills it, two stack, three are one over two, four a grid. */
export function photoGrid(n: number, gap = 0.02): { x: number; y: number; w: number; h: number }[] {
  const half = (1 - gap) / 2;
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) return [{ x: 0, y: 0, w: 1, h: half }, { x: 0, y: half + gap, w: 1, h: half }];
  if (n === 3) return [{ x: 0, y: 0, w: 1, h: half }, { x: 0, y: half + gap, w: half, h: half }, { x: half + gap, y: half + gap, w: half, h: half }];
  return [0, 1, 2, 3].map((i) => ({ x: (i % 2) * (half + gap), y: Math.floor(i / 2) * (half + gap), w: half, h: half }));
}

/** The source rectangle that fills a frame without stretching (cover). */
export function coverCrop(sw: number, sh: number, fw: number, fh: number): { sx: number; sy: number; sw: number; sh: number } {
  const s = Math.max(fw / sw, fh / sh);
  const w = fw / s;
  const h = fh / s;
  return { sx: (sw - w) / 2, sy: (sh - h) / 2, sw: w, sh: h };
}

/** Words broken into lines no wider than `width` by `measure`, at most
 * `maxLines`; a cut-off last line ends in an ellipsis. Kept here, with the
 * canvas's measureText passed in, so it can be tested without one. */
export function wrapText(text: string, width: number, measure: (s: string) => number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (measure(tryLine) <= width || !line) line = tryLine;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}…`) > width) last = last.replace(/\s*\S+$/, "");
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Saturday 14 March" -- the date on an entry page. readableDay spells it
 * out by hand, so the list renders the same on the server and the phone. */
export function bookDate(date: string): string {
  return readableDay(date, { long: true });
}

/** The file's name: "Santos family year book 2026.pdf". */
export function bookFileName(household: string, year: number): string {
  const clean = household.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Kin";
  return `${clean} year book ${year}.pdf`;
}

/** A PDF of whole-page JPEGs, one per page, each `wPt` by `hPt` points. */
export function imagesToPdf(pages: { jpeg: Uint8Array; px: { w: number; h: number } }[], pt = { w: (PAGE_MM.w / 25.4) * 72, h: (PAGE_MM.h / 25.4) * 72 }): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === "string" ? enc.encode(b) : b;
    chunks.push(bytes);
    length += bytes.length;
  };
  const begin = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };
  const w = pt.w.toFixed(2);
  const h = pt.h.toFixed(2);

  // 1 catalog, 2 page tree, then three objects a page: page, image, drawing.
  const pageObj = (i: number) => 3 + i * 3;
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  begin(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  begin(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] >>\nendobj\n`);
  pages.forEach((p, i) => {
    const n = pageObj(i);
    begin(n);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>\nendobj\n`);
    begin(n + 1);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.px.w} /Height ${p.px.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    push("\nendstream\nendobj\n");
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    begin(n + 2);
    push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`);
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
