/** The text of a PDF, read in the browser with pdf.js (#679). The file and
 * its password stay on the device: this returns lines of text, and only
 * those are sent anywhere (lib/actions/statement-ai.ts).
 *
 * Loaded on demand (`import()` where it is used), because pdf.js is a
 * large library and only the statement import, and only for a PDF, needs
 * it. The worker file is copied into public/pdfjs/ by scripts/copy-mediapipe
 * .mjs before every build and dev start, the way MediaPipe's engine is. */

export type PdfTextResult = { ok: true; lines: string[]; pages: number } | { ok: false; reason: "password" | "wrong-password" | "unreadable" };

const WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

/** Lines of text, page by page, items on one printed line joined with a
 * space. `password` is asked for when the PDF needs one (GCash's does). */
export async function pdfTextLines(file: File, password?: string): Promise<PdfTextResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  const data = new Uint8Array(await file.arrayBuffer());
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data, password: password || undefined }).promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    // pdf.js: PasswordException with code 1 (needed) or 2 (incorrect).
    if (e?.name === "PasswordException") return { ok: false, reason: e.code === 2 ? "wrong-password" : "password" };
    return { ok: false, reason: "unreadable" };
  }
  const lines: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // Items that share a baseline (within a couple of points) are one
      // printed line; pdf.js hands them back in reading order already.
      let current: { y: number; parts: string[] } | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform[5]);
        if (current && Math.abs(current.y - y) <= 2) current.parts.push(item.str);
        else {
          if (current) lines.push(current.parts.join(" "));
          current = { y, parts: [item.str] };
        }
        if (item.hasEOL && current) {
          lines.push(current.parts.join(" "));
          current = null;
        }
      }
      if (current) lines.push(current.parts.join(" "));
    }
    return { ok: true, lines: lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean), pages: doc.numPages };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    await doc.destroy().catch(() => {});
  }
}
