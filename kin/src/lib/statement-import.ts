/** Import a statement (20261019120000): a CSV of transaction history from
 * BPI, BDO, UnionBank or GCash, read entirely in the browser.
 *
 * Nothing here touches the network and the file is never uploaded or kept:
 * the person picks it, this reads it into rows, they map the columns and
 * review, and only the rows they tick are sent to
 * import_wealth_transactions(). The database skips duplicates by the same
 * rule as markDuplicates below, so the review screen and the save agree.
 *
 * Banks change their exports, so the presets only GUESS the columns from the
 * header; the person can always correct the mapping before anything is
 * read as money. */

export type Bank = "bpi" | "bdo" | "unionbank" | "gcash" | "other";

export const BANKS: { value: Bank; label: string; howTo: string }[] = [
  { value: "bpi", label: "BPI", howTo: "BPI Online → Accounts → the account → Transaction history → Download (CSV)." },
  { value: "bdo", label: "BDO", howTo: "BDO Online Banking → Accounts → Transaction history → Download, choose CSV." },
  { value: "unionbank", label: "UnionBank", howTo: "UnionBank Online (web) → Accounts → the account → Transactions → Download CSV." },
  {
    value: "gcash",
    label: "GCash",
    howTo:
      "GCash sends its transaction history as a password-protected PDF by email. Reading PDFs needs Kin AI, which isn't switched on yet — if you have a CSV of it (for example saved from a spreadsheet), it works here.",
  },
  { value: "other", label: "Another bank", howTo: "Any CSV with a date, a description and an amount (or debit and credit) column." },
];

export type DateFormat = "mdy" | "dmy" | "ymd";

export type Mapping = {
  headerRow: number;
  date: number;
  description: number;
  /** One signed amount column... */
  amount: number | null;
  /** ...or money out and money in in columns of their own. */
  debit: number | null;
  credit: number | null;
  dateFormat: DateFormat;
};

export type ParsedRow = {
  line: number;
  date: string | null;
  direction: "in" | "out" | null;
  amount: number | null;
  particulars: string;
  problem: string | null;
};

/** CSV into rows of cells: quoted fields, doubled quotes, commas, newlines
 * inside quotes, CRLF, a byte-order mark, and a semicolon- or tab-separated
 * file when that is plainly what it is. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": firstLine.split(",").length, ";": firstLine.split(";").length, "\t": firstLine.split("\t").length };
  const sep = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as "," | ";" | "\t") ?? ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const HEADER = {
  date: /^(transaction |posting |value |txn )?date( and time| & time|\/time)?$|^date posted$|^tran(saction)? date$/i,
  description: /desc|particular|details|remarks|narration|transaction type|^memo$/i,
  amount: /^(transaction )?amount( \(php\))?$|^amount php$/i,
  debit: /debit|withdraw|money out|^out$|payments?$/i,
  credit: /credit|deposit|money in|^in$/i,
};

/** The header row: the first row with a date-like heading and at least two
 * other cells. Statements often start with the account name and period. */
export function findHeaderRow(rows: string[][]): number {
  const i = rows.slice(0, 30).findIndex((r) => r.length >= 3 && r.some((c) => HEADER.date.test(c)));
  return i === -1 ? 0 : i;
}

/** The columns guessed from the header. Debit and credit win over a single
 * amount when the statement has both, as BPI's, BDO's and UnionBank's do.
 * `headerRow` is for when the person has said which row the header is. */
export function guessMapping(rows: string[][], headerRow: number = findHeaderRow(rows)): Mapping {
  const head = rows[headerRow] ?? [];
  const find = (re: RegExp, not?: RegExp) => {
    const i = head.findIndex((c) => re.test(c) && !(not && not.test(c)) && !/balance/i.test(c));
    return i === -1 ? null : i;
  };
  const date = find(HEADER.date) ?? 0;
  const debit = find(HEADER.debit);
  const credit = find(HEADER.credit);
  const amount = debit !== null && credit !== null ? null : find(HEADER.amount);
  const description = find(HEADER.description) ?? head.findIndex((_, i) => i !== date && i !== debit && i !== credit && i !== amount);
  const body = rows.slice(headerRow + 1).map((r) => r[date] ?? "");
  return { headerRow, date, description: Math.max(0, description), amount, debit: amount === null ? debit : null, credit: amount === null ? credit : null, dateFormat: guessDateFormat(body) };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Month-first unless a day above 12 says otherwise. Philippine bank
 * exports are month-first (10/19/2026); a statement saved from a
 * spreadsheet set to day-first is the exception this catches. */
export function guessDateFormat(values: string[]): DateFormat {
  if (values.some((v) => /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v.trim()))) return "ymd";
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (m && Number(m[1]) > 12) return "dmy";
  }
  return "mdy";
}

function monthOf(word: string): number | undefined {
  return MONTHS[word.slice(0, 3).toLowerCase()];
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** A statement's date into YYYY-MM-DD, or null. Numeric dates follow
 * `format`; "Oct 19, 2026", "19 Oct 2026" and "19-Oct-26" read either way.
 * A time after the date is ignored. */
export function parseDate(raw: string, format: DateFormat): string | null {
  const v = raw.trim();
  let m = v.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})\b/);
  if (m) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (format === "ymd" || m[1].length === 4) return iso(a, b, c);
    return format === "dmy" ? iso(c, b, a) : iso(c, a, b);
  }
  m = v.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{2,4})\b/);
  if (m && monthOf(m[1])) return iso(Number(m[3]), monthOf(m[1])!, Number(m[2]));
  m = v.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})\.?[ -](\d{2,4})\b/);
  if (m && monthOf(m[2])) return iso(Number(m[3]), monthOf(m[2])!, Number(m[1]));
  return null;
}

/** A statement's money into a signed number, or null when the cell is
 * empty. "₱1,234.50", "PHP 1,234.50", "(1,234.50)" and "1,234.50 DR" are
 * money out; "1,234.50 CR" is money in. */
export function parseAmount(raw: string): number | null {
  let v = raw.trim();
  if (!v || v === "-") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(v)) {
    sign = -1;
    v = v.slice(1, -1);
  }
  if (/\bDR\.?$/i.test(v)) {
    sign = -1;
    v = v.replace(/\bDR\.?$/i, "");
  } else v = v.replace(/\bCR\.?$/i, "");
  v = v.replace(/PHP|₱|P(?=\d)|\s|,/gi, "");
  if (v.startsWith("-")) {
    sign *= -1;
    v = v.slice(1);
  } else if (v.startsWith("+")) v = v.slice(1);
  if (!/^\d+(\.\d+)?$/.test(v)) return NaN;
  return sign * Math.round(Number(v) * 100) / 100;
}

/** The statement's rows, read through the mapping. A row whose date or
 * amount cannot be read is kept with its problem, so the review can say
 * which lines were left out and why. */
export function readRows(rows: string[][], map: Mapping): ParsedRow[] {
  const out: ParsedRow[] = [];
  rows.slice(map.headerRow + 1).forEach((r, i) => {
    const line = map.headerRow + i + 2;
    const particulars = (r[map.description] ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
    const date = parseDate(r[map.date] ?? "", map.dateFormat);
    let signed: number | null = null;
    if (map.amount !== null) signed = parseAmount(r[map.amount] ?? "");
    else {
      const moneyOut = map.debit !== null ? parseAmount(r[map.debit] ?? "") : null;
      const moneyIn = map.credit !== null ? parseAmount(r[map.credit] ?? "") : null;
      if (Number.isNaN(moneyOut) || Number.isNaN(moneyIn)) signed = NaN;
      // Both filled on one line cannot be read as one movement.
      else if (moneyOut && moneyIn) signed = NaN;
      else if (moneyOut) signed = -Math.abs(moneyOut);
      else if (moneyIn) signed = Math.abs(moneyIn);
    }
    // A closing-balance or totals line has no date: it is not a movement.
    if (!date && /total|balance|ending|beginning/i.test(r.join(" "))) return;
    let problem: string | null = null;
    if (!date) problem = "The date could not be read.";
    else if (signed === null) problem = "No amount on this line.";
    else if (Number.isNaN(signed) || signed === 0) problem = "The amount could not be read.";
    else if (!particulars) problem = "No description on this line.";
    const ok = problem === null && signed !== null && !Number.isNaN(signed);
    out.push({
      line,
      date,
      direction: ok ? (signed! < 0 ? "out" : "in") : null,
      amount: ok ? Math.abs(signed!) : null,
      particulars,
      problem,
    });
  });
  return out;
}

export type ExistingMovement = { date: string; direction: string; amount: number; particulars: string };

export function duplicateKey(m: { date: string; direction: string; amount: number; particulars: string }): string {
  return `${m.date}|${m.direction}|${m.amount.toFixed(2)}|${m.particulars.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

/** Which rows are already in the account: same day, direction, amount and
 * description. Counted, as the database counts -- a statement's second
 * identical row is new when the account holds only one. */
export function markDuplicates(rows: ParsedRow[], existing: ExistingMovement[]): boolean[] {
  const have = new Map<string, number>();
  for (const e of existing) have.set(duplicateKey(e), (have.get(duplicateKey(e)) ?? 0) + 1);
  return rows.map((r) => {
    if (r.problem || !r.date || !r.direction || r.amount === null) return false;
    const k = duplicateKey({ date: r.date, direction: r.direction, amount: r.amount, particulars: r.particulars });
    const left = have.get(k) ?? 0;
    if (left > 0) {
      have.set(k, left - 1);
      return true;
    }
    return false;
  });
}

export const MAX_STATEMENT_BYTES = 2 * 1024 * 1024;
export const MAX_STATEMENT_ROWS = 2000;
