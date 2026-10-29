// Counts every App Store text block in this folder against Apple's limit.
// A block is a fenced code block right after `<!-- field: <name>, max <n> -->`.
// Apple counts characters; the keyword field counts bytes, so does this.
// Also refuses the words the listing must never use (App Review 3.1.1).
//   node native/ios/store/check.mjs   (from kin/; ios.yml runs it)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = /\b(kin plus|subscri(be|ption)|upgrade|free trial|₱|php ?\d|price)/i;
let bad = 0;
let seen = 0;

for (const file of ["listing.md", "review-notes.md"]) {
  const text = readFileSync(path.join(here, file), "utf8");
  const re = /<!-- field: (\w+), max (\d+) -->\s*```\n([\s\S]*?)\n```/g;
  for (const m of text.matchAll(re)) {
    seen++;
    const [, name, max, body] = m;
    const size = name === "keywords" ? Buffer.byteLength(body) : [...body].length;
    const over = size > Number(max);
    // The review notes may say "no in-app purchases"; only the public text is checked.
    const word = name !== "reviewnotes" && body.match(FORBIDDEN);
    console.log(`${over || word ? "✗" : "✓"} ${file} ${name}: ${size}/${max}${word ? ` -- must not say "${word[0]}"` : ""}`);
    if (over || word) bad++;
  }
}
if (seen < 7) {
  console.error(`Expected 7 fields, found ${seen}: a marker was lost.`);
  bad++;
}
process.exit(bad ? 1 : 0);
