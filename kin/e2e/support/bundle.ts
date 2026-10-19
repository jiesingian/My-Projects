import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/** What a page's first load downloads, read from a production build (.next):
 * the framework's own files plus the client JavaScript of the layouts and
 * the page. Null when there is no build to read. */
export type Load = { files: string[]; gzip: number; text: string };

const NEXT = path.join(process.cwd(), ".next");

export function hasBuild(): boolean {
  return fs.existsSync(path.join(NEXT, "build-manifest.json")) && fs.existsSync(path.join(NEXT, "server/app"));
}

function entries(route: string): Record<string, string[]> {
  const g: { __RSC_MANIFEST?: Record<string, { entryJSFiles?: Record<string, string[]> }> } = {};
  new Function("globalThis", fs.readFileSync(path.join(NEXT, "server/app", route, "page_client-reference-manifest.js"), "utf8"))(g);
  return Object.values(g.__RSC_MANIFEST ?? {})[0]?.entryJSFiles ?? {};
}

/** `segments`: which entries count, by the end of their path ("app/layout",
 * "app/(app)/layout", "today/page"). */
export function firstLoad(route: string, segments: string[]): Load {
  const manifest = JSON.parse(fs.readFileSync(path.join(NEXT, "build-manifest.json"), "utf8")) as { rootMainFiles?: string[] };
  const files = new Set<string>(manifest.rootMainFiles ?? []);
  for (const [key, list] of Object.entries(entries(route))) if (segments.some((s) => key.endsWith(`/${s}`))) for (const f of list) files.add(f);
  let gzip = 0;
  let text = "";
  for (const f of files) {
    const p = path.join(NEXT, f.replace(/^\/?_next\//, ""));
    if (!fs.existsSync(p)) continue;
    const b = fs.readFileSync(p);
    gzip += zlib.gzipSync(b).length;
    text += b.toString("utf8");
  }
  return { files: [...files], gzip, text };
}
