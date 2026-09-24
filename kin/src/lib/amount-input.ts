/** How a money field reads while someone types into it: an accounting figure,
 * "12,345.00", rather than the bare "12345" a number input shows. Pure, so the
 * rules can be tested without a browser; AmountInput is the thin part that
 * wires them to an <input>. */

/** Keeps a keystroke's worth of input to digits and one decimal point, at
 * most two places after it, with the thousands grouped by commas. Anything
 * else typed or pasted -- a currency sign, a space, a second point -- is
 * dropped rather than refused, so pasting "₱ 12,345.6" still lands. */
export function groupAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  let whole = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const cents = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  whole = whole.replace(/^0+(?=\d)/, "");
  if (whole === "" && cents !== null) whole = "0";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents === null ? grouped : `${grouped}.${cents}`;
}

/** Pads a finished entry to exactly two places: "1,234" becomes "1,234.00".
 * Applied when the field is left, not on every keystroke -- padding while
 * someone is still typing would put zeros in front of the next digit. */
export function finishAmountInput(display: string): string {
  if (display === "") return "";
  const [whole, cents = ""] = display.split(".");
  return `${whole || "0"}.${cents.padEnd(2, "0")}`;
}

/** The plain number a displayed amount stands for, as the form submits it:
 * "12,345.60" becomes "12345.60", and an empty field stays empty. */
export function amountValue(display: string): string {
  return display.replace(/,/g, "");
}

/** A stored amount as the field should first show it. */
export function amountDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return finishAmountInput(groupAmountInput(n.toFixed(2)));
}

/** Where the caret belongs after a reformat, so a comma appearing or
 * disappearing doesn't throw it forward or back: just past the same number of
 * digits (and decimal point) that were before it in what was typed. */
export function caretAfterReformat(raw: string, caret: number, display: string): number {
  if (caret >= raw.length) return display.length;
  const significant = (raw.slice(0, caret).match(/[\d.]/g) ?? []).length;
  if (significant === 0) return 0;
  let seen = 0;
  for (let i = 0; i < display.length; i++) {
    if (display[i] !== ",") seen++;
    if (seen === significant) return i + 1;
  }
  return display.length;
}
