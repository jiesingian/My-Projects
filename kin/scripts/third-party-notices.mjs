// Writes public/legal/third-party-notices.txt before every build: the name,
// version, licence and licence text of every package Kin's production code
// depends on (package-lock.json, everything not marked dev). MIT, ISC, BSD
// and Apache-2.0 ask that their notice travel with copies of the code, and
// Kin's code reaches every browser and the iPhone and Android apps; the
// licences page (app/legal/licenses) links here. Generated, like
// public/mediapipe/, so it can never fall behind the lockfile; the file is
// ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const LICENCE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$|^licen[cs]e[-.]/i;

const seen = new Map();
for (const [where, pkg] of Object.entries(lock.packages ?? {})) {
  if (!where || pkg.dev || pkg.devOptional) continue;
  const name = where.slice(where.lastIndexOf("node_modules/") + "node_modules/".length);
  const key = `${name}@${pkg.version}`;
  if (seen.has(key)) continue;
  const dir = path.join(root, where);
  // A platform build for another machine (sharp for Windows, say) is in the
  // lockfile but not installed, and never shipped from this one.
  if (!fs.existsSync(dir)) continue;
  const texts = fs
    .readdirSync(dir)
    .filter((f) => LICENCE_FILE.test(f))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim());
  seen.set(key, { name, version: pkg.version, license: pkg.license ?? "see the package", texts });
}

const entries = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
const rule = "=".repeat(72);
const out = [
  "Kin: third-party notices",
  "",
  "Kin is built with the open-source software below. Each is used under its own",
  "licence, given in full after its name. Generated from package-lock.json when",
  "this version of Kin was built.",
  "",
  ...entries.flatMap((e) => [rule, `${e.name} ${e.version}`, `Licence: ${e.license}`, "", ...(e.texts.length ? e.texts.flatMap((t) => [t, ""]) : ["(No licence file in the package; its licence is the one named above.)", ""])]),
].join("\n");

// Under /legal/ so a signed-out visitor and a store reviewer can open it:
// the sign-in check lets /legal/ through (lib/supabase/middleware.ts).
fs.mkdirSync(path.join(root, "public", "legal"), { recursive: true });
fs.writeFileSync(path.join(root, "public", "legal", "third-party-notices.txt"), out);
console.log(`third-party-notices: ${entries.length} packages written to public/legal/third-party-notices.txt`);
