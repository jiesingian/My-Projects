"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";
import { setAccountQrAction } from "@/lib/actions/wealth";

/** Kept under account_qr_codes' 400 KB check with room to spare. */
const MAX_CHARS = 380_000;

/** The picture made small enough to keep: a QR needs a few hundred pixels,
 * not the twelve million of a phone photo. PNG keeps its edges sharp; JPEG
 * only when a PNG of a photo is still too big. */
async function shrink(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  for (const side of [900, 640, 480]) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const url of [canvas.toDataURL("image/png"), canvas.toDataURL("image/jpeg", 0.92)]) {
      if (url.length <= MAX_CHARS) return url;
    }
  }
  return null;
}

/** An account's QR code for receiving money (Janine, 27 October), on the
 * account's page under its number. Show QR puts it full-screen, white, for
 * someone to scan and pay in. Who may add, change or remove it is the
 * number's rule (`canSet`); who sees it, row-level security has already
 * decided by the time `image` arrives. */
export function AccountQr({ accountId, accountName, image, canSet }: { accountId: string; accountName: string; image: string | null; canSet: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  if (!image && !canSet) return null;

  async function save(next: string | null) {
    setBusy(true);
    const { error } = await setAccountQrAction(accountId, next);
    setBusy(false);
    if (error) toast.error(error);
    else router.refresh();
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    const url = await shrink(file).catch(() => null);
    if (!url) {
      toast.error("Kin couldn't read that picture. Try a screenshot of the QR alone.");
      return;
    }
    await save(url);
  }

  const small = { minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", display: "inline-flex", alignItems: "center", gap: "0.3125rem" } as const;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
      <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>QR code</span>
      <span style={{ marginLeft: "auto", display: "inline-flex", gap: "0.375rem" }}>
        {image && (
          <button type="button" className="btn btn-secondary" style={small} onClick={() => setOpen(true)}>
            <Icon name="eye" size={14} /> Show QR
          </button>
        )}
        {canSet && (
          <button type="button" className="btn btn-secondary" style={small} disabled={busy} onClick={() => fileRef.current?.click()}>
            {image ? "Change" : "+ Add QR code"}
          </button>
        )}
        {canSet && image && (
          <button
            type="button"
            className="btn btn-secondary"
            style={small}
            disabled={busy}
            aria-label="Remove QR code"
            onClick={async () => {
              if (await confirm({ title: `Remove ${accountName}'s QR code?`, confirmLabel: "Remove", danger: true })) await save(null);
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        )}
      </span>
      {canSet && (
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      )}
      {open && image && <QrFullScreen image={image} accountName={accountName} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** White, the code as big as the screen allows, screen kept awake: what the
 * person paying needs to scan it, as a loyalty card is shown at checkout. */
function QrFullScreen({ image, accountName, onClose }: { image: string; accountName: string; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => {
        if (gone) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      gone = true;
      window.removeEventListener("keydown", onKey);
      void lock?.release().catch(() => {});
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#fff",
        color: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "calc(env(safe-area-inset-top, 0) + 1rem) 1rem calc(env(safe-area-inset-bottom, 0) + 1rem)",
        textAlign: "center",
      }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close the QR code"
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0) + 0.75rem)",
          right: "0.75rem",
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "2px solid #000",
          background: "#fff",
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="x" size={20} />
      </button>
      <div id={titleId} style={{ font: "700 1.5rem/1.2 var(--font-heading)" }}>
        {accountName}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`QR code to pay into ${accountName}`} style={{ maxWidth: "min(88vw, 62vh)", maxHeight: "62vh", objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
      <div style={{ fontSize: "0.875rem" }}>Scan to send money</div>
    </div>,
    document.body,
  );
}
