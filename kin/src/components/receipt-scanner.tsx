"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ErrorText, RequiredMark } from "@/components/form";
import { AmountInput } from "@/components/amount-input";
import { DateInput } from "@/components/date-input";
import { formatCurrency, currencySymbol } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/wealth";
import { shrink } from "@/lib/shrink-photo";
import { KIN_AI_PRIVACY } from "@/lib/kin-ai";
import { scanReceiptAction } from "@/lib/actions/receipt";
import { recordMovementAction, addBillAction } from "@/lib/actions/wealth";
import { receiptParticulars, type ReceiptKind, type ScannedReceipt } from "@/lib/receipt-scan";
import type { PickableAccount } from "@/components/money-actions";

const SOURCE_LABEL: Record<ScannedReceipt["source"], string> = {
  receipt: "a receipt",
  gcash: "a GCash confirmation",
  maya: "a Maya confirmation",
  instapay: "an InstaPay transfer",
  bank: "a bank confirmation",
  bill: "a bill",
  other: "the picture",
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Snap a receipt or an e-wallet screenshot: the picture is read, one
 * expense or bill is proposed, and the member checks every field before
 * pressing Record. `ready` is whether the key is on the server; `plus` is
 * whether the household may use it at all. Nothing is saved by the scan. */
export function ReceiptScanner({ accounts, currency, ready, plus }: { accounts: PickableAccount[]; currency: string; ready: boolean; plus: boolean }) {
  const uid = useId();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ScannedReceipt | null>(null);
  const [kind, setKind] = useState<ReceiptKind>("expense");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState("");
  const [payee, setPayee] = useState("");
  const [category, setCategory] = useState<string>("Other");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [scanning, startScan] = useTransition();
  const [saving, startSave] = useTransition();
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const canScan = ready && plus;

  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    setDraft(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    if (input.current) input.current.value = "";
    if (!canScan) return;
    startScan(async () => {
      const form = new FormData();
      try {
        form.set("photo", new File([await shrink(file)], "receipt.jpg", { type: "image/jpeg" }));
      } catch {
        form.set("photo", file);
      }
      const result = await scanReceiptAction(form);
      if (result.error || !result.receipt) {
        setError(result.error ?? "Nothing was read.");
        return;
      }
      const r = result.receipt;
      setDraft(r);
      setKind(r.kind);
      setAmount(r.amount);
      setDate(r.date || todayLocal());
      setDueDate(r.due_date);
      setPayee(r.payee);
      setCategory(r.category);
      setAccountId(r.account_id ?? accounts[0]?.id ?? "");
      setNotes([r.notes, r.reference ? `ref ${r.reference}` : ""].filter(Boolean).join(" · "));
    });
  };

  const save = () => {
    setError(null);
    if (!(amount > 0)) return setError("Enter an amount greater than zero.");
    if (!payee.trim()) return setError("Say who was paid.");
    startSave(async () => {
      if (kind === "expense") {
        if (!accountId) return setError("Add an account in Wealth first, then the expense can be recorded against it.");
        const occurredAt = new Date(`${date}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
        const res = await recordMovementAction({
          accountId,
          direction: "out",
          amount,
          particulars: receiptParticulars({ payee, notes, reference: "" }),
          category,
          occurredAt,
          viaApp: false,
        });
        if (res.error) return setError(res.error);
        setDone(`Recorded ${formatCurrency(amount, currency)} to ${payee.trim()} as ${category}.`);
      } else {
        const form = new FormData();
        form.set("name", payee.trim());
        form.set("amount", String(amount));
        form.set("due_date", dueDate);
        form.set("category", category);
        form.set("recurrence", "once");
        const res = await addBillAction({ error: null }, form);
        if (res.error) return setError(res.error);
        setDone(`Added ${payee.trim()}, ${formatCurrency(amount, currency)}${dueDate ? `, due ${dueDate}` : ""}, to Bills.`);
      }
      setDraft(null);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      router.refresh();
    });
  };

  return (
    <section className="kin-scan" aria-labelledby={`${uid}-h`}>
      <div className="kin-scan-head">
        <span className="kin-scan-icon" aria-hidden="true">
          <Icon name="camera" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 id={`${uid}-h`}>Snap a receipt or screenshot</h3>
          <p>A store receipt, a GCash / Maya / InstaPay confirmation, or a Meralco or water bill. Kin reads the amount, the date and who was paid; you check it, then record it.</p>
        </div>
      </div>
      <input ref={input} id={`${uid}-file`} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={scanning || saving} />
      <label htmlFor={`${uid}-file`} className="btn btn-secondary btn-block" aria-disabled={scanning || saving}>
        {scanning ? "Reading the picture…" : draft || preview ? "Scan another" : "Take or choose a picture"}
      </label>
      {!plus ? (
        <p className="kin-scan-off" role="note">
          Reading receipts is part of Kin Plus. With Plus, a photo of a receipt or a screenshot of a GCash, Maya or InstaPay confirmation becomes an expense or a bill after a quick check, and a GCash PDF statement imports too. Nothing is sent until then.
        </p>
      ) : !ready ? (
        <p className="kin-scan-off" role="note">
          Kin AI isn&apos;t switched on yet (Jonathan adds it once). Until then your picture shows here so you can copy the amount into Move money. Nothing is sent anywhere.
        </p>
      ) : null}
      <p className="kin-scan-privacy">{KIN_AI_PRIVACY}</p>
      {preview && !draft && (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a static asset
        <img src={preview} alt="The receipt or screenshot you chose" className="kin-scan-preview" style={{ maxHeight: 240, objectFit: "contain" }} />
      )}
      {scanning && (
        <div className="kin-scan-reading" aria-hidden="true">
          <span className="kin-skeleton" />
          <span className="kin-skeleton" />
        </div>
      )}
      <ErrorText message={error} />
      {done && (
        <p role="status" className="kin-scan-done">
          <Icon name="check" size={14} /> {done}
        </p>
      )}
      {draft && (
        <div className="kin-scan-review">
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0.5rem" }}>
            Read from {SOURCE_LABEL[draft.source]}. Check each field; nothing is saved until you press the button.
          </p>
          <div className="seg" style={{ marginBottom: "0.75rem" }}>
            <button type="button" data-active={kind === "expense"} onClick={() => setKind("expense")}>
              Paid already
            </button>
            <button type="button" data-active={kind === "bill"} onClick={() => setKind("bill")}>
              A bill to pay
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Field label={`Amount (${currencySymbol(currency)})`} required style={{ flex: 1 }}>
              <AmountInput defaultValue={draft.amount} onValueChange={setAmount} required style={{ minHeight: "2.75rem" }} />
            </Field>
            <Field label={kind === "bill" ? "Issued" : "Date"} style={{ flex: 1 }}>
              <DateInput className="input" value={date} onChange={(e) => setDate(e.target.value)} style={{ minHeight: "2.75rem" }} />
            </Field>
          </div>
          {kind === "bill" && (
            <Field label="Due">
              <DateInput className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ minHeight: "2.75rem" }} />
            </Field>
          )}
          <Field label={kind === "bill" ? "Biller" : "Paid to"} required>
            <input className="input" value={payee} onChange={(e) => setPayee(e.target.value)} maxLength={150} style={{ minHeight: "2.75rem" }} />
          </Field>
          <Field label="Category">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.75rem" }}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          {kind === "expense" && (
            <Field label="Out of account">
              {accounts.length === 0 ? (
                <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: 0 }}>Add an account in Wealth first.</p>
              ) : (
                <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ minHeight: "2.75rem" }}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {formatCurrency(a.balance, currency)}
                    </option>
                  ))}
                </select>
              )}
              {draft.account_id === null && <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0" }}>Kin couldn&apos;t tell which account; check this one.</p>}
            </Field>
          )}
          {kind === "expense" && (
            <Field label="Notes">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="What was bought, a reference" style={{ minHeight: "2.75rem" }} />
            </Field>
          )}
          <button type="button" className="btn btn-primary btn-block" disabled={saving || (kind === "expense" && !accountId)} onClick={save} style={{ minHeight: "2.875rem" }}>
            {saving ? "…" : kind === "expense" ? "RECORD THE EXPENSE" : "ADD TO BILLS"}
          </button>
        </div>
      )}
    </section>
  );
}

function Field({ label, children, style, required }: { label: string; children: React.ReactNode; style?: React.CSSProperties; required?: boolean }) {
  return (
    <div className="field" style={{ marginBottom: "0.875rem", ...style }}>
      <label>
        {label}
        {required && <RequiredMark />}
        {children}
      </label>
    </div>
  );
}
