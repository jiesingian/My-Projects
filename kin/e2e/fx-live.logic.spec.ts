import { test, expect } from "@playwright/test";
import { pesoRate, USD_PEGS } from "@/lib/fx";

/** The remittance log's reference rates, asked of the real Frankfurter.
 *
 * remittances.logic.spec.ts checks the arithmetic against a stand-in; this
 * checks the stand-in was right about the service: the URL, the response
 * shape, that PHP is quoted at all, and that the dollar-peg route for the Gulf
 * currencies lands where it should. Claude's containers cannot reach
 * Frankfurter and nobody had logged a remittance in production yet, so until
 * this ran on CI's runners the live path had never been exercised.
 *
 * When Frankfurter cannot be reached (a sandbox, or the service being down),
 * the test skips and says so rather than failing everyone's pull request for
 * someone else's outage. When it answers, it has to answer correctly. */

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=PHP", { signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

test("Frankfurter quotes pesos the way the remittance log reads them", async () => {
  test.skip(!(await reachable()), "Frankfurter is not reachable from here; nothing live to check.");

  // A Sunday: the rate comes back for the Friday before, and says so.
  const usd = await pesoRate("USD", "2026-09-27");
  expect(usd, "a USD rate for a past day").not.toBeNull();
  expect(usd!.source).toBe("ecb");
  expect(usd!.rateDate).toBe("2026-09-25");
  // Pesos to the dollar have sat between 40 and 80 for a generation; outside
  // that, the number is not a peso rate at all.
  expect(usd!.rate).toBeGreaterThan(40);
  expect(usd!.rate).toBeLessThan(80);

  const sar = await pesoRate("SAR", "2026-09-27");
  expect(sar?.source).toBe("usd_peg");
  expect(sar!.rate).toBeCloseTo(usd!.rate / USD_PEGS.SAR, 6);

  const jpy = await pesoRate("JPY", "2026-09-25");
  expect(jpy?.source).toBe("ecb");
  expect(jpy!.rate).toBeGreaterThan(0.1);
  expect(jpy!.rate).toBeLessThan(1);
});
