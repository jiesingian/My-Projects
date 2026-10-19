import { test, expect } from "@playwright/test";
import { guessMapping, markDuplicates, parseAmount, parseCsv, parseDate, readRows, guessDateFormat } from "@/lib/statement-import";

/** Reading a bank's CSV export without a browser or a database: the CSV
 * itself, each bank's columns guessed from its header, dates and amounts in
 * the ways Philippine banks write them, and duplicates counted the way
 * import_wealth_transactions() counts them. The sample files are shaped like
 * each bank's export; banks change theirs, which is why the mapping step
 * lets a person correct the guess. */

const BPI = `Account Name,JUAN DELA CRUZ
Account Number,XXXX-XXX-123
Period,10/01/2026 - 10/19/2026

Transaction Date,Check Number,Description,Debit,Credit,Running Balance
10/01/2026,,"POS PURCHASE  SM SUPERMARKET",1250.75,,48749.25
10/02/2026,,PAYROLL CREDIT,,"25,000.00","73,749.25"
10/03/2026,,INSTAPAY TRANSFER FEE,25.00,,"73,724.25"
,,Ending Balance,,,"73,724.25"
`;

const BDO = `Posting Date,Description,Withdrawal,Deposit,Balance
19-Oct-26,ATM WITHDRAWAL,"5,000.00",,"10,000.00"
18-Oct-26,INTEREST EARNED,,1.23,"15,000.00"
`;

const UNIONBANK = `Date,Transaction ID,Transaction Description,Debit,Credit,Running Balance
2026-10-05,UB123,Meralco bill payment,"3,210.00",,"20,000.00"
2026-10-06,UB124,"Transfer from Ana, thanks",,500,"20,500.00"
`;

const GCASH = `Date and Time,Description,Reference No.,Debit,Credit,Balance
2026-10-07 09:15 AM,Buy Load,1234,50.00,,950.00
2026-10-07 18:40 PM,Received GCash from MARIA S.,5678,,"1,000.00","1,950.00"
`;

test("parseCsv handles quotes, commas and newlines inside them, CRLF and a BOM", () => {
  const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3');
  expect(rows).toEqual([
    ["a", "b", "c"],
    ["x, y", 'say "hi"', "two\nlines"],
    ["1", "2", "3"],
  ]);
  expect(parseCsv("a;b;c\n1;2;3")[1]).toEqual(["1", "2", "3"]);
});

test("BPI: the header is found under the account preamble, debit and credit become out and in, the ending balance is not a row", () => {
  const rows = parseCsv(BPI);
  const map = guessMapping(rows);
  expect(rows[map.headerRow][map.date]).toBe("Transaction Date");
  expect(rows[map.headerRow][map.description]).toBe("Description");
  expect(map.amount).toBeNull();
  expect(rows[map.headerRow][map.debit!]).toBe("Debit");
  expect(rows[map.headerRow][map.credit!]).toBe("Credit");
  const read = readRows(rows, map);
  expect(read.map((r) => [r.date, r.direction, r.amount, r.particulars, r.problem])).toEqual([
    ["2026-10-01", "out", 1250.75, "POS PURCHASE SM SUPERMARKET", null],
    ["2026-10-02", "in", 25000, "PAYROLL CREDIT", null],
    ["2026-10-03", "out", 25, "INSTAPAY TRANSFER FEE", null],
  ]);
});

test("BDO: withdrawal and deposit columns, and dates like 19-Oct-26", () => {
  const rows = parseCsv(BDO);
  const read = readRows(rows, guessMapping(rows));
  expect(read.map((r) => [r.date, r.direction, r.amount])).toEqual([
    ["2026-10-19", "out", 5000],
    ["2026-10-18", "in", 1.23],
  ]);
});

test("UnionBank: ISO dates, a description with a comma in it", () => {
  const rows = parseCsv(UNIONBANK);
  const read = readRows(rows, guessMapping(rows));
  expect(read.map((r) => [r.date, r.direction, r.amount, r.particulars])).toEqual([
    ["2026-10-05", "out", 3210, "Meralco bill payment"],
    ["2026-10-06", "in", 500, "Transfer from Ana, thanks"],
  ]);
});

test("GCash (a CSV of it): the time after the date is ignored", () => {
  const rows = parseCsv(GCASH);
  const read = readRows(rows, guessMapping(rows));
  expect(read.map((r) => [r.date, r.direction, r.amount])).toEqual([
    ["2026-10-07", "out", 50],
    ["2026-10-07", "in", 1000],
  ]);
});

test("a single signed amount column", () => {
  const rows = parseCsv("Date,Details,Amount\n10/01/2026,Coffee,-120.00\n10/02/2026,Refund,(1.00)\n10/03/2026,Salary,PHP 30000");
  const map = guessMapping(rows);
  expect(map.amount).toBe(2);
  expect(readRows(rows, map).map((r) => [r.direction, r.amount])).toEqual([
    ["out", 120],
    ["out", 1],
    ["in", 30000],
  ]);
});

test("a line that cannot be read says why rather than vanishing", () => {
  const rows = parseCsv("Date,Description,Amount\n13/45/2026,Bad date,10\n10/01/2026,No money,\n10/02/2026,Words,abc");
  const read = readRows(rows, guessMapping(rows));
  expect(read.map((r) => r.problem)).toEqual(["The date could not be read.", "No amount on this line.", "The amount could not be read."]);
});

test("parseDate reads Philippine bank dates, and refuses impossible ones", () => {
  expect(parseDate("10/19/2026", "mdy")).toBe("2026-10-19");
  expect(parseDate("19/10/2026", "dmy")).toBe("2026-10-19");
  expect(parseDate("2026-10-19 08:00", "mdy")).toBe("2026-10-19");
  expect(parseDate("Oct 19, 2026", "mdy")).toBe("2026-10-19");
  expect(parseDate("September 3, 2026", "dmy")).toBe("2026-09-03");
  expect(parseDate("19 Oct 2026", "mdy")).toBe("2026-10-19");
  expect(parseDate("02/30/2026", "mdy")).toBeNull();
  expect(parseDate("", "mdy")).toBeNull();
});

test("guessDateFormat is month-first unless a day above 12 says otherwise", () => {
  expect(guessDateFormat(["10/01/2026", "10/12/2026"])).toBe("mdy");
  expect(guessDateFormat(["01/10/2026", "19/10/2026"])).toBe("dmy");
  expect(guessDateFormat(["2026-10-19"])).toBe("ymd");
});

test("parseAmount reads pesos the ways statements write them", () => {
  expect(parseAmount("₱1,234.50")).toBe(1234.5);
  expect(parseAmount("PHP 1,234.50")).toBe(1234.5);
  expect(parseAmount("(1,234.50)")).toBe(-1234.5);
  expect(parseAmount("1,234.50 DR")).toBe(-1234.5);
  expect(parseAmount("1,234.50 CR")).toBe(1234.5);
  expect(parseAmount("-50")).toBe(-50);
  expect(parseAmount("")).toBeNull();
  expect(parseAmount("-")).toBeNull();
  expect(parseAmount("twelve")).toBeNaN();
});

test("markDuplicates counts: one already in the account matches one row of the statement", () => {
  const rows = readRows(parseCsv("Date,Description,Amount\n10/03/2026,Load,-50\n10/03/2026,Load,-50\n10/03/2026,LOAD  ,-50\n10/04/2026,Load,-50"), guessMapping(parseCsv("Date,Description,Amount")));
  const dup = markDuplicates(rows, [
    { date: "2026-10-03", direction: "out", amount: 50, particulars: "load" },
    { date: "2026-10-03", direction: "out", amount: 50, particulars: "Load" },
  ]);
  expect(dup).toEqual([true, true, false, false]);
});
