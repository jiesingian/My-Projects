"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFamilyAddressAction, removeFamilyAddressAction } from "@/lib/actions/family";

export type FamilyAddress = { id: string; label: string; address_line: string; zip_code: string | null };

function mapsUrl(address: FamilyAddress) {
  const query = [address.address_line, address.zip_code].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function FamilyAddressList({ addresses, canEdit }: { addresses: FamilyAddress[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function add() {
    setBusy(true);
    setError(null);
    const result = await addFamilyAddressAction(label, addressLine, zipCode);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setLabel("");
    setAddressLine("");
    setZipCode("");
    setAdding(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this address?")) return;
    await removeFamilyAddressAction(id);
    router.refresh();
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)", marginBottom: 8 }}>
        ADDRESSES
      </div>
      {addresses.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: "var(--color-neutral-600)", marginBottom: 10 }}>No addresses added yet.</div>
      )}
      {addresses.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--color-divider)" }}>
          <span
            style={{
              font: "600 9px/1 var(--font-heading)",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--color-accent-700)",
              border: "1px solid var(--color-accent-700)",
              borderRadius: 3,
              padding: "3px 6px",
              flex: "none",
            }}
          >
            {a.label}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, display: "block" }}>{a.address_line}</span>
            {a.zip_code && <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{a.zip_code}</span>}
          </span>
          <a
            href={mapsUrl(a)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--color-accent-700)", textDecoration: "none", flex: "none" }}
          >
            MAP ↗
          </a>
          {canEdit && (
            <button
              type="button"
              onClick={() => remove(a.id)}
              style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "var(--color-accent-700)" }}
            >
              REMOVE
            </button>
          )}
        </div>
      ))}

      {canEdit && (
        <>
          {adding ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div className="field" style={{ width: 110 }}>
                  <label>TAG</label>
                  <input className="input" placeholder="Home" value={label} onChange={(e) => setLabel(e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>ADDRESS</label>
                  <input className="input" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
              </div>
              <div className="field" style={{ width: 140, marginBottom: 8 }}>
                <label>ZIP / POSTAL CODE</label>
                <input className="input" value={zipCode} onChange={(e) => setZipCode(e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
              </div>
              {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, margin: "0 0 8px" }}>{error}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 38, fontSize: 12 }} disabled={busy} onClick={() => setAdding(false)}>
                  CANCEL
                </button>
                <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: 38, fontSize: 12 }} disabled={busy} onClick={add}>
                  {busy ? "SAVING…" : "SAVE ADDRESS"}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 36, fontSize: 11.5, marginTop: 10 }} onClick={() => setAdding(true)}>
              + ADD ADDRESS
            </button>
          )}
        </>
      )}
    </div>
  );
}
