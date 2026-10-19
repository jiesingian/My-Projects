import { test, expect } from "@playwright/test";
import { canKeepApart, capLine, drawLoop, drawProblem, parseWishes, type DrawPerson } from "@/lib/gift-draw";

/** Monito-monita (20261019233200_gift_draw.sql): the draw's rules. The
 * database runs the real draw (draw_gift_draw) the same way; the PGlite
 * probe holds it to the same rules. */

const people = (spec: Record<string, number>): DrawPerson[] =>
  Object.entries(spec).flatMap(([family, n]) => Array.from({ length: n }, (_, i) => ({ id: `${family}${i}`, familyId: family })));

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

function isOneLoop(picks: Map<string, string>): boolean {
  const start = picks.keys().next().value!;
  let at = start;
  let steps = 0;
  do {
    at = picks.get(at)!;
    steps++;
  } while (at !== start && steps <= picks.size);
  return steps === picks.size;
}

test("at least three people", () => {
  expect(drawProblem(people({ A: 2 }), false)).toBe("Put at least 3 people in to draw.");
  expect(drawProblem(people({ A: 3 }), false)).toBeNull();
});

test("households apart only when none is more than half", () => {
  expect(canKeepApart(people({ A: 2, B: 2 }))).toBe(true);
  expect(canKeepApart(people({ A: 3, B: 1, C: 1 }))).toBe(false);
  expect(drawProblem(people({ A: 4, B: 1, C: 1 }), true)).toMatch(/more than half/);
  expect(drawProblem(people({ A: 4, B: 1, C: 1 }), false)).toBeNull();
});

test("every draw: nobody picks themselves, everyone is picked once, one loop", () => {
  for (let seed = 1; seed < 200; seed++) {
    const all = people({ A: 1 + (seed % 5), B: 1 + (seed % 3), C: 1 });
    const picks = drawLoop(all, false, seeded(seed));
    expect(picks.size).toBe(all.length);
    expect(new Set(picks.values()).size).toBe(all.length);
    for (const [g, r] of picks) expect(g).not.toBe(r);
    expect(isOneLoop(picks)).toBe(true);
  }
});

test("households apart: never your own household, even at exactly half", () => {
  const family = (id: string) => id[0];
  const specs: Record<string, number>[] = [{ A: 2, B: 2 }, { A: 3, B: 2, C: 1 }, { A: 5, B: 5 }, { A: 4, B: 3, C: 2 }, { A: 1, B: 1, C: 1, D: 1, E: 1 }];
  for (const spec of specs) {
    for (let seed = 1; seed < 60; seed++) {
      const picks = drawLoop(people(spec), true, seeded(seed));
      for (const [g, r] of picks) expect(family(g)).not.toBe(family(r));
      expect(isOneLoop(picks)).toBe(true);
    }
  }
});

test("the cap as the card says it", () => {
  expect(capLine(500, "PHP")).toBe("₱500 max");
  expect(capLine(null, "PHP")).toBe("No price cap");
});

test("wishes: one a line, trimmed, at most ten", () => {
  expect(parseWishes("  Jollibee GC \n\n Socks  (blue)\n")).toEqual(["Jollibee GC", "Socks (blue)"]);
  expect(parseWishes(Array.from({ length: 12 }, (_, i) => `w${i}`).join("\n"))).toHaveLength(10);
});
