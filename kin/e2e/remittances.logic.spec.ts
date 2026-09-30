import { test, expect } from "@playwright/test";
import { remittancesByMonth, INCOME_SOURCES } from "@/lib/wealth";
import { pesoRate, USD_PEGS } from "@/lib/fx";

/** The remittance log's arithmetic, without a browser: the monthly totals,
 * and the reference rate -- ECB currencies straight from Frankfurter, the
 * Gulf currencies through their fixed dollar peg, the Kuwaiti dinar not at
 * all. Frankfurter itself is stubbed; nothing here leaves the machine. */

type Row = { sent_on: string; php_received: number | string };

test("remittancesByMonth groups newest month first and totals the pesos that arrived", () => {
  const rows: Row[] = [
    { sent_on: "2026-08-30", php_received: 10000 },
    { sent_on: "2026-09-02", php_received: "28000.50" },
    { sent_on: "2026-09-25", php_received: 14800 },
  ];
  const months = remittancesByMonth(rows);
  expect(months.map((m) => m.key)).toEqual(["2026-09", "2026-08"]);
  expect(months[0].total).toBeCloseTo(42800.5, 2);
  expect(months[0].rows.map((r) => r.sent_on)).toEqual(["2026-09-25", "2026-09-02"]);
  expect(months[1].total).toBe(10000);
});

test("remittancesByMonth of nothing is nothing", () => {
  expect(remittancesByMonth([])).toEqual([]);
});

test("Remittance is an income source a money-in can be filed under", () => {
  expect(INCOME_SOURCES).toContain("Remittance");
});

function stubFrankfurter(rates: Record<string, { rate: number; date: string }>) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const from = new URL(url).searchParams.get("from")!;
    const hit = rates[from];
    if (!hit) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ date: hit.date, rates: { PHP: hit.rate } }), { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("an ECB currency is converted directly, and keeps the day the rate is for", async () => {
  const stub = stubFrankfurter({ USD: { rate: 57.1, date: "2026-09-25" } });
  try {
    // A Sunday: Frankfurter answers with Friday's rate and Friday's date.
    const r = await pesoRate("usd", "2026-09-27");
    expect(r).toEqual({ rate: 57.1, rateDate: "2026-09-25", source: "ecb" });
    expect(stub.calls[0]).toContain("/2026-09-27?from=USD&to=PHP");
  } finally {
    stub.restore();
  }
});

test("a Gulf currency goes through the dollar at its fixed peg", async () => {
  const stub = stubFrankfurter({ USD: { rate: 57.0, date: "2026-09-25" } });
  try {
    const sar = await pesoRate("SAR", "2026-09-25");
    expect(sar?.source).toBe("usd_peg");
    expect(sar?.rate).toBeCloseTo(57.0 / USD_PEGS.SAR, 8);
    expect(stub.calls.every((u) => u.includes("from=USD"))).toBe(true);
  } finally {
    stub.restore();
  }
});

test("no rate for the Kuwaiti dinar, a future day, a bad code, or a service that is down", async () => {
  const stub = stubFrankfurter({});
  try {
    expect(await pesoRate("KWD", "2026-09-25")).toBeNull();
    expect(await pesoRate("USD", "2999-01-01")).toBeNull();
    expect(await pesoRate("US", "2026-09-25")).toBeNull();
    expect(await pesoRate("USD", "25/09/2026")).toBeNull();
    expect(await pesoRate("USD", "2026-09-25")).toBeNull(); // the stub answers 404
    expect(stub.calls.length).toBe(1); // only the last one ever reached the network
  } finally {
    stub.restore();
  }
});
