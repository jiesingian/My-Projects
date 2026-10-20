"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { openEmergencyItemAction, emergencyFileUrlAction, type OpenedDocument, type OpenedPassword } from "@/lib/actions/vault-emergency";
import type { EmergencyItem } from "@/lib/queries/vault-emergency";

/** The household's vault, read-only, while emergency access is open.
 * The list carries names only. Each item is fetched when it is opened, and
 * the database logs that opening as it hands the item over, so the
 * household sees exactly what was looked at. There is no add, edit or
 * delete anywhere on this screen, and the database refuses them anyway. */
export function EmergencyVaultViewer({ requestId, items }: { requestId: string; items: EmergencyItem[] }) {
  const passwords = items.filter((i) => i.kind === "password");
  const documents = items.filter((i) => i.kind === "document");
  const groups = (list: EmergencyItem[]) => [...new Set(list.map((i) => i.group))];

  if (items.length === 0) return <p className="kin-vault-empty">Nothing to show: the vault is empty, or nothing in it is shared this way.</p>;

  return (
    <div className="kin-vault">
      {passwords.length > 0 && <h3 style={{ font: "600 1rem/1.2 var(--font-heading)", margin: "0.5rem 0 0" }}>Passwords</h3>}
      {groups(passwords).map((g) => (
        <section key={`p-${g}`} className="kin-vault-group" aria-label={g}>
          <h4>
            <Icon name="keyRound" size={15} /> {g}
          </h4>
          {passwords.filter((i) => i.group === g).map((i) => <Row key={i.id} requestId={requestId} item={i} />)}
        </section>
      ))}
      {documents.length > 0 && <h3 style={{ font: "600 1rem/1.2 var(--font-heading)", margin: "1.25rem 0 0" }}>Documents</h3>}
      {groups(documents).map((g) => (
        <section key={`d-${g}`} className="kin-vault-group" aria-label={g}>
          <h4>
            <Icon name="fileText" size={15} /> {g}
          </h4>
          {documents.filter((i) => i.group === g).map((i) => <Row key={i.id} requestId={requestId} item={i} />)}
        </section>
      ))}
      <p className="kin-vault-hint" style={{ marginTop: "0.75rem" }}>
        Press and hold a password to see it. Documents kept in their Google Drive can&rsquo;t be shared this way.
      </p>
    </div>
  );
}

function Row({ requestId, item }: { requestId: string; item: EmergencyItem }) {
  const [opened, setOpened] = useState<OpenedPassword | OpenedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    setError(null);
    const result = await openEmergencyItemAction(requestId, item.kind, item.id);
    setBusy(false);
    if ("error" in result) setError(result.error);
    else setOpened(result.item);
  }

  const title = item.kind === "document" && item.owner ? `${item.label} (${item.owner.split(" ")[0]})` : item.label;

  return (
    <div className="kin-vault-item" style={{ alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="kin-vault-label">{title}</div>
        {item.kind === "document" && !opened && (
          <div className="kin-vault-sub">
            {item.fileCount} file{item.fileCount === 1 ? "" : "s"}
          </div>
        )}
        {opened?.kind === "password" && <PasswordDetail p={opened} />}
        {opened?.kind === "document" && <DocumentDetail d={opened} />}
        {error && <p className="kin-vault-error">{error}</p>}
      </div>
      {!opened && (
        <div className="kin-vault-actions">
          <button type="button" className="kin-vault-text" onClick={open} disabled={busy}>
            {busy ? "Opening…" : "Open"}
          </button>
        </div>
      )}
    </div>
  );
}

function PasswordDetail({ p }: { p: OpenedPassword }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const fallback = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(fallback.current), []);
  const hide = () => setShown(false);

  // As in the household's own vault: press and hold to see it, and copy
  // never puts it on the screen.
  async function copy() {
    try {
      await navigator.clipboard.writeText(p.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setShown(true);
      window.clearTimeout(fallback.current);
      fallback.current = window.setTimeout(() => setShown(false), 5000);
    }
  }

  return (
    <>
      {p.username && <div className="kin-vault-sub">{p.username}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        <button
          type="button"
          className="kin-vault-secret kin-vault-hold"
          data-shown={shown || undefined}
          aria-label={shown ? `${p.label}: ${p.secret}` : `Press and hold to show ${p.label}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setShown(true);
          }}
          onPointerUp={hide}
          onPointerCancel={hide}
          onLostPointerCapture={hide}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              setShown(true);
            }
          }}
          onKeyUp={hide}
          onBlur={hide}
          onContextMenu={(e) => e.preventDefault()}
        >
          {shown ? p.secret : "•".repeat(Math.min(Math.max(p.secret.length, 6), 14))}
        </button>
        <span className="kin-vault-actions">
          <button type="button" onClick={copy} aria-label={`Copy ${p.label}`} className="kin-vault-text" style={{ gap: "0.25rem", display: "inline-flex", alignItems: "center" }}>
            <Icon name={copied ? "check" : "copy"} size={15} />
            {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </div>
      {p.note && <div className="kin-vault-sub">{p.note}</div>}
    </>
  );
}

function DocumentDetail({ d }: { d: OpenedDocument }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const facts = [d.docType, d.referenceNo && `No. ${d.referenceNo}`, d.expiresAt && `Expires ${d.expiresAt}`].filter(Boolean).join(" · ");

  async function download(id: string, path: string) {
    setLoading(id);
    setError(null);
    const url = await emergencyFileUrlAction(path);
    setLoading(null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setError("That file could not be opened. Access may have ended.");
  }

  return (
    <>
      {facts && <div className="kin-vault-sub">{facts}</div>}
      {d.note && <div className="kin-vault-sub">{d.note}</div>}
      <div style={{ display: "grid", gap: "0.375rem", marginTop: "0.375rem" }}>
        {d.files.map((f) =>
          f.storagePath ? (
            <button
              key={f.id}
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: "0.84375rem", justifyContent: "flex-start", gap: "0.5rem" }}
              disabled={loading === f.id}
              onClick={() => download(f.id, f.storagePath!)}
            >
              <Icon name="download" size={14} />
              {loading === f.id ? "Preparing…" : f.name}
            </button>
          ) : (
            <div key={f.id} className="kin-vault-sub" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <Icon name="hardDrive" size={14} /> {f.name}: kept in their Google Drive, so it can&rsquo;t be shared here.
            </div>
          ),
        )}
        {d.files.length === 0 && <div className="kin-vault-sub">No files on this entry.</div>}
      </div>
      {error && <p className="kin-vault-error">{error}</p>}
    </>
  );
}
