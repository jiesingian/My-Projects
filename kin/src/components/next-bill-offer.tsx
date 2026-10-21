"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNextBillAction } from "@/lib/actions/wealth";
import { FormSheet } from "@/components/form-sheet";
import { AmountInput } from "@/components/amount-input";
import { DateInput } from "@/components/date-input";
import { currencySymbol, spellDate } from "@/lib/format";
import { nextLabel, type NextBillOffer } from "@/lib/bill-roll";

/** "Add next month's Meralco for Sun 15 Nov 2026?" (Jonathan, 21 October).
 * A bill just paid raises it in a sheet (PayBillControl sends the event);
 * Cash Flow and Today list the paid ones that have no next one yet. Amount
 * and date are prefilled and editable; nothing is added without Add. Not now
 * hides an offer on this device for a week. */

const EVENT = "kin:next-bill";
const HIDE_KEY = "kin.nextBill.notNow";
const WEEK = 7 * 86400_000;

export function raiseNextBill(offer: NextBillOffer | null | undefined) {
  if (offer) window.dispatchEvent(new CustomEvent<NextBillOffer>(EVENT, { detail: offer }));
}

function readHidden(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(HIDE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function hide(billId: string) {
  try {
    const now = Date.now();
    const kept = Object.fromEntries(Object.entries(readHidden()).filter(([, until]) => until > now));
    window.localStorage.setItem(HIDE_KEY, JSON.stringify({ ...kept, [billId]: now + WEEK }));
  } catch {
    /* private window: Not now lasts until the page is left */
  }
}

function OfferForm({ offer, currency, onDone }: { offer: NextBillOffer; currency: string; onDone: (added: boolean) => void }) {
  const [amount, setAmount] = useState(offer.amount);
  const [dueDate, setDueDate] = useState(offer.dueDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const uid = useId();
  return (
    <div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: "0.84375rem", margin: "0 0 8px" }}>{error}</p>}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor={`${uid}-amount`}>Amount ({currencySymbol(currency)})</label>
          <AmountInput id={`${uid}-amount`} ariaLabel={`Amount (${currencySymbol(currency)})`} defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.5rem" }} />
        </div>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor={`${uid}-date`}>Due</label>
          <DateInput id={`${uid}-date`} className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ minHeight: "2.5rem" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
          onClick={() =>
            start(async () => {
              const res = await addNextBillAction({ fromBillId: offer.billId, amount, dueDate });
              setError(res.error);
              if (res.error) return;
              onDone(true);
              router.refresh();
            })
          }
        >
          {pending ? "…" : "Add"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => onDone(false)}>
          Not now
        </button>
      </div>
    </div>
  );
}

const question = (o: NextBillOffer) => `Add ${nextLabel(o.repeat)} ${o.name} for ${spellDate(o.dueDate) || o.dueDate}?`;

/** The sheet a payment raises, and the list of paid bills still without a
 * next one. `offers` comes from getNextBillOffers, for a grown-up only. */
export function NextBillOffers({ offers, currency, heading }: { offers: NextBillOffer[]; currency: string; heading?: string }) {
  const [justPaid, setJustPaid] = useState<NextBillOffer | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    const now = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only there after mount
    setHidden(new Set(Object.entries(readHidden()).filter(([, until]) => until > now).map(([id]) => id)));
    const onOffer = (e: Event) => setJustPaid((e as CustomEvent<NextBillOffer>).detail);
    window.addEventListener(EVENT, onOffer);
    return () => window.removeEventListener(EVENT, onOffer);
  }, []);

  const done = (billId: string, added: boolean) => {
    if (!added) hide(billId);
    setHidden((h) => new Set(h).add(billId));
    setJustPaid((j) => (j?.billId === billId ? null : j));
  };

  const shown = offers.filter((o) => !hidden.has(o.billId) && o.billId !== justPaid?.billId);
  return (
    <>
      <FormSheet open={!!justPaid} onClose={() => justPaid && done(justPaid.billId, false)} title={justPaid ? question(justPaid) : ""}>
        {justPaid && (
          <div style={{ marginTop: "0.625rem" }}>
            <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", margin: "0 0 0.625rem" }}>It repeats, and Kin has no next one yet. Change the amount or the date if they differ.</p>
            <OfferForm key={justPaid.billId} offer={justPaid} currency={currency} onDone={(added) => done(justPaid.billId, added)} />
          </div>
        )}
      </FormSheet>
      {shown.length > 0 && heading && <h3 className="kin-eyebrow">{heading}</h3>}
      {shown.map((o) => (
        <div key={o.billId} data-next-bill={o.billId} style={{ padding: "0.75rem", margin: "0.5rem 0", borderRadius: 12, background: "color-mix(in srgb, var(--cal-money) 8%, transparent)" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", fontWeight: 600 }}>{question(o)}</p>
          <OfferForm offer={o} currency={currency} onDone={(added) => done(o.billId, added)} />
        </div>
      ))}
    </>
  );
}
