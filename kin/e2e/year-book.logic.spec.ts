import { test, expect } from "@playwright/test";
import { bookDate, bookFileName, bookPages, bookYears, chooseYearBook, coverCrop, imagesToPdf, pagePixels, photoGrid, wrapText, type YearBookEntry } from "@/lib/year-book";

/** The year book: which entries go in, how the pages fall, and a PDF a print
 * shop opens. Drawing is on the phone; everything it decides is here. */

const entry = (id: string, date: string, more: Partial<YearBookEntry> = {}): YearBookEntry => ({
  id,
  date,
  title: id,
  note: null,
  milestone: false,
  milestoneOf: null,
  people: [],
  photos: [],
  reactions: 0,
  ...more,
});

test("every milestone of the year is ticked; the best-loved photo entries fill the rest", () => {
  const all = [
    entry("first-steps", "2026-03-14", { milestone: true }),
    entry("beach", "2026-04-02", { photos: ["a", "b"], reactions: 5 }),
    entry("market", "2026-04-09", { photos: ["c"], reactions: 1 }),
    entry("words-only", "2026-05-01"),
    entry("last-year", "2025-12-25", { milestone: true, photos: ["d"] }),
    entry("lola", "2026-06-01", { photos: ["e", "f", "g"], reactions: 1 }),
  ];
  const { entries, selected } = chooseYearBook(all, 2026, 2);
  // An entry with neither a ★ nor a photo has nothing to print; another year's never comes in.
  expect(entries.map((e) => e.id)).toEqual(["first-steps", "beach", "market", "lola"]);
  // Reactions first, then more photos: market and lola tie on reactions, lola has more photos.
  expect([...selected].sort()).toEqual(["beach", "first-steps", "lola"]);
});

test("the pages: a cover, a divider per month, one page per entry, an end page", () => {
  const chosen = [
    entry("b", "2026-04-02", { photos: ["p1", "p2", "p3", "p4", "p5"] }),
    entry("a", "2026-03-14", { milestone: true, photos: ["m1"] }),
    entry("c", "2026-04-20"),
  ];
  const pages = bookPages("Santos", 2026, chosen);
  expect(pages.map((p) => p.kind)).toEqual(["cover", "month", "entry", "month", "entry", "entry", "end"]);
  // The cover takes the first milestone's photo.
  expect(pages[0]).toMatchObject({ kind: "cover", photo: "m1", count: 3, year: 2026 });
  // Four photos at most on a page.
  const four = pages[4];
  expect(four.kind === "entry" && four.photos).toEqual(["p1", "p2", "p3", "p4"]);
});

test("photo frames stay inside the area and do not overlap", () => {
  for (let n = 1; n <= 4; n++) {
    const cells = photoGrid(n);
    expect(cells).toHaveLength(n);
    for (const c of cells) {
      expect(c.x + c.w).toBeLessThanOrEqual(1.0001);
      expect(c.y + c.h).toBeLessThanOrEqual(1.0001);
    }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const [a, b] = [cells[i], cells[j]];
        const apart = a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;
        expect(apart).toBe(true);
      }
  }
});

test("a photo fills its frame without stretching", () => {
  // A wide photo in a square frame: the middle square of it.
  expect(coverCrop(400, 200, 100, 100)).toEqual({ sx: 100, sy: 0, sw: 200, sh: 200 });
  const tall = coverCrop(300, 900, 200, 100);
  expect(tall.sw / tall.sh).toBeCloseTo(2);
});

test("words wrap to the width and a cut-off line ends in an ellipsis", () => {
  const measure = (s: string) => s.length; // one unit a letter
  expect(wrapText("the first day of school", 10, measure)).toEqual(["the first", "day of", "school"]);
  expect(wrapText("the first day of school", 10, measure, 2)).toEqual(["the first", "day of…"]);
  // A word longer than the line still gets a line of its own.
  expect(wrapText("supercalifragilistic", 5, measure)).toEqual(["supercalifragilistic"]);
});

test("years, dates and the file's name", () => {
  expect(bookYears(["2025-01-01", "2026-03-01", "2026-04-01"])).toEqual([2026, 2025]);
  expect(bookDate("2026-03-14")).toBe("Saturday 14 March");
  expect(bookFileName("Santos / Reyes", 2026)).toBe("Santos Reyes year book 2026.pdf");
  expect(pagePixels(200)).toEqual({ w: 1654, h: 2339 });
});

test("the PDF is one A4 page per image, with an index that points at each object", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = imagesToPdf([
    { jpeg, px: { w: 10, h: 14 } },
    { jpeg, px: { w: 10, h: 14 } },
  ]);
  const text = new TextDecoder("latin1").decode(pdf);
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  expect(text).toContain("/Count 2");
  expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
  expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
  expect(text).toContain("/Filter /DCTDecode /Length 4");

  // startxref names where the index starts; each entry names where its object starts.
  const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
  expect(text.slice(startxref, startxref + 4)).toBe("xref");
  const rows = text.slice(startxref).split("\n").slice(3, 3 + 8);
  rows.forEach((row, i) => {
    const at = Number(row.slice(0, 10));
    expect(text.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
  });
});
