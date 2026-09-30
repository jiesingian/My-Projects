"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { joinUrl, qrModules, qrPath } from "@/lib/qr";

const MARGIN = 4;
const noSubscribe = () => () => {};

/** The household's invite as a QR code: point a phone at it and the join
 * flow opens (app/join). Drawn in the browser from the link itself (lib/qr),
 * so the invite goes nowhere else. Always black on white, dark mode or not:
 * a light-on-dark code is one many camera apps refuse to read.
 *
 * "Save image" hands over a PNG -- to the share sheet where the phone has
 * one, so it can go straight to Viber or Messenger or Photos, and as a
 * download where it does not. */
export function InviteQr({ code, householdName }: { code: string; householdName?: string }) {
  // The origin is only known in the browser; until then nothing is drawn,
  // rather than a code for the wrong address.
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => null);
  const url = origin ? joinUrl(origin, code) : null;
  const [saved, setSaved] = useState(false);

  const modules = useMemo(() => (url ? qrModules(url) : null), [url]);
  if (!url || !modules) return <div className="kin-qr-frame" aria-hidden="true" />;
  const size = modules.length + MARGIN * 2;
  const path = qrPath(modules, MARGIN);

  const toPng = () =>
    new Promise<Blob>((resolve, reject) => {
      const scale = 12;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.scale(scale, scale);
      ctx.fill(new Path2D(path));
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png");
    });

  const save = async () => {
    const blob = await toPng();
    const file = new File([blob], "kin-invite.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Join our family on Kin", text: `Scan to join ${householdName ?? "our household"} on Kin` });
        return;
      } catch {
        // Cancelled, or refused: save it instead.
      }
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <figure className="kin-qr">
      <div className="kin-qr-frame">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code that opens Kin's join page for this household" shapeRendering="crispEdges">
          <rect width={size} height={size} fill="#fff" />
          <path d={path} fill="#000" />
        </svg>
      </div>
      <figcaption className="kin-qr-caption">Scan with a phone camera to join</figcaption>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem", gap: "0.375rem" }} onClick={() => void save()}>
        <Icon name={saved ? "check" : "download"} size={16} />
        {saved ? "Saved" : "Save image"}
      </button>
    </figure>
  );
}
