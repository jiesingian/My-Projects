"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { logRemittanceAction } from "@/lib/actions/wealth";
import { addUtangAction, addUtangPaymentAction } from "@/lib/actions/utang";
import { REMITTANCE_CHANNELS, REMITTANCE_CHANNEL_LABELS, type RemittanceChannel } from "@/lib/wealth";
import { REMITTANCE_CURRENCIES } from "@/lib/fx";
import { formatCurrency } from "@/lib/format";
import { ErrorText } from "@/components/form";
import { DateInput } from "@/components/date-input";

/* The two categories of Add income with more to say than an amount
 * (Janine, 23 October): picked like any other category, they open the
 * fields their own logs keep -- a remittance's currency, what arrived and
 * how; an utang's person and due date -- and save there, so the Remittances
 * and Utang & paluwagan pages stay complete. What those pages add beyond
 * this (what a remittance went to, instalments, a paluwagan's rounds) is a
 * link away. */

const field: React.CSSProperties = { minHeight: "2.625rem" };
const label: React.CSSProperties = { display: "block", fontSize: "0.8125rem", fontWeight: 600, margin: "0 0 0.3125rem" };
const box: React.CSSProperties = { borderLeft: "3px solid var(--color-accent)", paddingLeft: "0.75rem", margin: "0.25rem 0 0.875rem" };
const note: React.CSSProperties = { fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45, margin: "0 0 0.75rem" };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: "0.625rem" }}>{children}</div>;
}

function Field({ name, children, flex = 1 }: { name: string; children: React.ReactNode; flex?: number }) {
  return (
    <label style={{ display: "block", flex, minWidth: 0, marginBottom: "0.75rem" }}>
      <span style={label}>{name}</span>
      {children}
    </label>
  );
}

function Buttons({ pending, onCancel, saveLabel = "Save" }: { pending: boolean; onCancel: () => void; saveLabel?: string }) {
  return (
    <div style={{ display: "flex", gap: "0.625rem" }}>
      <button type="submit" className="btn btn-primary" disabled={pending} style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}>
        {pending ? "…" : saveLabel}
      </button>
      <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** Remittance from abroad: who sent it, what was sent and in what, the pesos
 * that arrived, how, and where it was deposited. Saved to the remittance
 * log, which puts the money-in on the account as it always has. */
export function RemittanceFields({ accounts, onDone }: { accounts: { id: string; name: string }[]; onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = await logRemittanceAction({
            senderMemberId: null,
            senderName: String(f.get("sender") ?? ""),
            receiverMemberId: null,
            amount: Number(f.get("amount") ?? 0),
            currency: String(f.get("currency") ?? ""),
            sentOn: String(f.get("sent_on") ?? ""),
            phpReceived: Number(f.get("php_received") ?? 0),
            channel: String(f.get("channel") ?? "gcash"),
            channelName: "",
            accountId: String(f.get("account_id") ?? "") || null,
            note: "",
            isPrivate: false,
            allocations: [],
          });
          setError(res.error);
          if (res.error) return;
          router.refresh();
          onDone();
        });
      }}
    >
      <ErrorText message={error} />
      <Field name="Source (who sent it)">
        <input className="input" name="sender" required placeholder="Aunt Nena, Dubai" style={field} />
      </Field>
      <div style={box}>
        <Row>
          <Field name="Amount sent" flex={1.4}>
            <input className="input" type="number" step="0.01" min="0" name="amount" required style={field} />
          </Field>
          <Field name="Currency">
            <select className="input" name="currency" defaultValue={REMITTANCE_CURRENCIES[0]} style={field}>
              {REMITTANCE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </Row>
        <Row>
          <Field name="How it came">
            <select className="input" name="channel" defaultValue="gcash" style={field}>
              {REMITTANCE_CHANNELS.map((c: RemittanceChannel) => (
                <option key={c} value={c}>
                  {REMITTANCE_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field name="Sent on">
            <DateInput className="input" name="sent_on" defaultValue={today()} required style={field} />
          </Field>
        </Row>
      </div>
      <Field name="Amount that arrived">
        <input className="input" type="number" step="0.01" min="0" name="php_received" required style={field} />
      </Field>
      <Field name="Deposited to account">
        <select className="input" name="account_id" defaultValue="" style={field}>
          <option value="">Choose later</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <p style={note}>
        What it went to, and the day&rsquo;s exchange rate, are on the <Link href="/wealth/remittances">Remittances from abroad</Link> page.
      </p>
      <Buttons pending={pending} onCancel={onDone} />
    </form>
  );
}

export type OpenLent = { id: string; personName: string; left: number };

/** Utang & paluwagan as money in: money borrowed from someone, a payment
 * back on money lent, or -- with its rounds and members -- a paluwagan
 * payout, which lives on its own page. */
export function UtangFields({ openLent, currency, onDone }: { openLent: OpenLent[]; currency: string; onDone: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<"borrowed" | "repaid" | "paluwagan">("borrowed");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const choices = [
    ["borrowed", "Borrowed from someone"],
    ["repaid", "Paid back to me"],
    ["paluwagan", "Savings circle payout"],
  ] as const;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = kind === "repaid" ? await addUtangPaymentAction({ error: null }, f) : await addUtangAction({ error: null }, f);
          setError(res.error);
          if (res.error) return;
          router.refresh();
          onDone();
        });
      }}
    >
      <ErrorText message={error} />
      <div role="group" aria-label="What it is" style={{ display: "flex", flexWrap: "wrap", gap: "0.4375rem", marginBottom: "0.875rem" }}>
        {choices.map(([k, text]) => (
          <button key={k} type="button" className="chip" data-active={kind === k} onClick={() => setKind(k)}>
            {text}
          </button>
        ))}
      </div>
      {kind === "borrowed" && (
        <>
          <input type="hidden" name="direction" value="borrowed" />
          <Field name="Source (who lent it)">
            <input className="input" name="person_name" required placeholder="Uncle Ben" style={field} />
          </Field>
          <div style={box}>
            <Row>
              <Field name="Amount">
                <input className="input" type="number" step="0.01" min="0" name="amount" required style={field} />
              </Field>
              <Field name="Received">
                <DateInput className="input" name="started_on" defaultValue={today()} style={field} />
              </Field>
            </Row>
            <Field name="Due back on (optional)">
              <DateInput className="input" name="due_on" style={field} />
            </Field>
          </div>
          <p style={note}>
            Paying it back in instalments, or keeping it to yourself, is set on the <Link href="/wealth/utang">Lending &amp; savings circles</Link> page.
          </p>
          <Buttons pending={pending} onCancel={onDone} />
        </>
      )}
      {kind === "repaid" &&
        (openLent.length === 0 ? (
          <p style={note}>
            Nobody owes the household anything on record. Money lent is added on the <Link href="/wealth/utang">Lending &amp; savings circles</Link> page.
          </p>
        ) : (
          <>
            <Field name="Source (who paid back)">
              <select className="input" name="utang_id" required style={field}>
                {openLent.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.personName} · {formatCurrency(u.left, currency)} left
                  </option>
                ))}
              </select>
            </Field>
            <div style={box}>
              <Row>
                <Field name="Amount">
                  <input className="input" type="number" step="0.01" min="0" name="amount" required style={field} />
                </Field>
                <Field name="Paid on">
                  <DateInput className="input" name="paid_on" defaultValue={today()} style={field} />
                </Field>
              </Row>
            </div>
            <Buttons pending={pending} onCancel={onDone} />
          </>
        ))}
      {kind === "paluwagan" && (
        <p style={note}>
          A savings circle&rsquo;s payout follows its rounds and members — mark it on the <Link href="/wealth/utang">Lending &amp; savings circles</Link> page, where your group is.
        </p>
      )}
    </form>
  );
}
