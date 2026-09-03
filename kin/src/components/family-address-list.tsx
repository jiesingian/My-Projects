"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addFamilyAddressAction, removeFamilyAddressAction, type FamilyAddressFields } from "@/lib/actions/family";

export type FamilyAddress = {
  id: string;
  label: string;
  address_line: string;
  house_no: string | null;
  building: string | null;
  street: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip_code: string | null;
};

function mapsUrl(address: FamilyAddress) {
  const query =
    [[address.house_no, address.building].filter(Boolean).join(" "), address.street, address.barangay, address.city, address.province, address.zip_code, address.country]
      .filter(Boolean)
      .join(", ") || address.address_line;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const emptyFields: FamilyAddressFields = {
  label: "",
  houseNo: "",
  building: "",
  street: "",
  barangay: "",
  city: "",
  province: "",
  country: "Philippines",
  zipCode: "",
};

export function FamilyAddressList({ addresses, canEdit }: { addresses: FamilyAddress[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [fields, setFields] = useState<FamilyAddressFields>(emptyFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function set<K extends keyof FamilyAddressFields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function add() {
    setBusy(true);
    setError(null);
    const result = await addFamilyAddressAction(fields);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFields(emptyFields);
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
              alignSelf: "flex-start",
            }}
          >
            {a.label}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, display: "block" }}>
              {[[a.house_no, a.building].filter(Boolean).join(" "), a.street].filter(Boolean).join(", ") || a.address_line}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>
              {[a.barangay, a.city, a.province, a.zip_code].filter(Boolean).join(", ")}
            </span>
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
              <div className="field" style={{ marginBottom: 8 }}>
                <label>TAG</label>
                <input className="input" placeholder="Home" value={fields.label} onChange={(e) => set("label", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>HOUSE / UNIT NO.</label>
                  <input className="input" value={fields.houseNo} onChange={(e) => set("houseNo", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
                <div className="field" style={{ flex: 2 }}>
                  <label>BUILDING / SUBDIVISION</label>
                  <input className="input" value={fields.building} onChange={(e) => set("building", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>STREET</label>
                <input className="input" value={fields.street} onChange={(e) => set("street", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>BARANGAY</label>
                  <input className="input" value={fields.barangay} onChange={(e) => set("barangay", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>CITY / MUNICIPALITY</label>
                  <input className="input" value={fields.city} onChange={(e) => set("city", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>PROVINCE</label>
                  <input className="input" value={fields.province} onChange={(e) => set("province", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
                <div className="field" style={{ width: 110 }}>
                  <label>ZIP CODE</label>
                  <input className="input" value={fields.zipCode} onChange={(e) => set("zipCode", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>COUNTRY</label>
                <input className="input" value={fields.country} onChange={(e) => set("country", e.target.value)} style={{ minHeight: 40 }} disabled={busy} />
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
