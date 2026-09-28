// Copies MediaPipe's WebAssembly engine out of node_modules into
// public/mediapipe/ before every build and dev start, so Kin serves it itself
// (video-call effects, components/call-effects-tray.tsx). About 23 MB, which
// is why it is copied rather than committed; public/mediapipe/ is ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const from = path.join(here, "..", "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = path.join(here, "..", "public", "mediapipe");

if (!fs.existsSync(from)) {
  console.warn("copy-mediapipe: @mediapipe/tasks-vision is not installed; video-call effects will be unavailable.");
  process.exit(0);
}
fs.mkdirSync(to, { recursive: true });
for (const file of fs.readdirSync(from)) {
  if (!/^vision_wasm(_nosimd)?_internal\.(js|wasm)$/.test(file)) continue;
  fs.copyFileSync(path.join(from, file), path.join(to, file));
}
console.log("copy-mediapipe: engine copied to public/mediapipe/");
