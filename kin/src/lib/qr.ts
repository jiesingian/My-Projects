import qrcode from "qrcode-generator";

/** A QR code, made here rather than by a web service: an invite link sent to
 * a QR API is a household's way in handed to a third party. qrcode-generator
 * is a small, dependency-free MIT library that runs in the browser.
 *
 * Medium error correction: a code on a phone screen held up to another
 * phone, or printed and stuck on the fridge, survives a smudge or a glare
 * without growing so dense that an older camera cannot read it. */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** The dark modules as one SVG path, one unit per module, offset by a quiet
 * zone of `margin` modules -- the white border scanners need to find it. */
export function qrPath(modules: boolean[][], margin = 4): string {
  let d = "";
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    }),
  );
  return d;
}

/** The household's join link, the one the Share button sends (app/join). */
export function joinUrl(origin: string, code: string): string {
  return `${origin}/join/${code.replace(/[^A-Za-z0-9]/g, "")}`;
}
