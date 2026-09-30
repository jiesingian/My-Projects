"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logRemittanceAction, lookupRemittanceRateAction } from "@/lib/actions/wealth";
import { REMITTANCE_CHANNELS, REMITTANCE_CHANNEL_LABELS, type RemittanceChannel } from "@/lib/wealth";
import { formatCurrency } from "@/lib/format";
import { ErrorText } from "@/components/form";
import { DateInput } from "@/components/date-input";
import type { PesoRate } from "@/lib/fx";

const SOMEONE_ELSE = "__other";
const NOTE: React.CSSProperties = { fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45, margin: "0 0 0.875rem" };

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Allocation = { purpose: string; amount: string; category: string };

/** One padala: what was sent and in what, what the ECB said it was worth that
 * day, what actually arrived, who and how, and -- optionally -- which
 * account it landed in and what it went to.
 *
 * The reference rate is a preview, fetched as the currency and date change;
 * the server looks it up again when saving rather than trusting this one. */
export function RemittanceForm({
  members,
  accounts,
  currencies,
  meId,
}: {
  members: { id: string; label: string }[];
  /** Accounts this grown-up may pay into: joint ones, and their own. */
  accounts: { id: string; name: string; isJoint: boolean }[];
  currencies: readonly string[];
  meId: string;
}) {
  const router = useRouter();
  const [sender, setSender] = useState(members.find((m) => m.id !== meId)?.id ?? SOMEONE_ELSE);
  const [senderName, setSenderName] = useState("");
  const [receiver, setReceiver] = useState(meId);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(currencies[0]);
  const [sentOn, setSentOn] = useState(todayLocal());
  const [received, setReceived] = useState("");
  const [channel, setChannel] = useState<RemittanceChannel>("gcash");
  const [channelName, setChannelName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [justMe, setJustMe] = useState(false);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  // The last answer, and which currency and day it answers. Anything else
  // is still being looked up.
  const [looked, setLooked] = useState<{ key: string; rate: PesoRate | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    const key = `${currency}|${sentOn}`;
    lookupRemittanceRateAction(currency, sentOn).then((r) => live && setLooked({ key, rate: r }));
    return () => {
      live = false;
    };
  }, [currency, sentOn]);

  const rate: PesoRate | null | "loading" = looked?.key === `${currency}|${sentOn}` ? looked.rate : "loading";
  const sent = Number(amount);
  const estimate = rate && rate !== "loading" && sent > 0 ? Math.round(sent * rate.rate * 100) / 100 : null;
  const arrived = Number(received);
  const allocated = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const selectedAccount = accounts.find((a) => a.id === accountId);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await logRemittanceAction({
        senderMemberId: sender === SOMEONE_ELSE ? null : sender,
        senderName: sender === SOMEONE_ELSE ? senderName : "",
        receiverMemberId: receiver || null,
        amount: sent,
        currency,
        sentOn,
        phpReceived: arrived,
        channel,
        channelName,
        accountId: accountId || null,
        note,
        isPrivate: justMe,
        allocations: allocations.map((a) => ({ purpose: a.purpose, amount: Number(a.amount) || 0, category: a.category || null })),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/wealth/remittances");
      router.refresh();
    });
  }

  return (
    <div>
      <ErrorText message={error} />

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="From" style={{ flex: 1, minWidth: 0 }}>
          <select className="input" value={sender} onChange={(e) => setSender(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value={SOMEONE_ELSE}>Someone not on Kin</option>
          </select>
        </Field>
        <Field label="To" style={{ flex: 1, minWidth: 0 }}>
          <select className="input" value={receiver} onChange={(e) => setReceiver(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="">The household</option>
          </select>
        </Field>
      </div>
      {sender === SOMEONE_ELSE && (
        <Field label="Their name">
          <input className="input" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Kuya Ben" maxLength={120} autoComplete="off" />
        </Field>
      )}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Amount sent" style={{ flex: 1.4, minWidth: 0 }}>
          <input className="input" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" />
        </Field>
        <Field label="Currency" style={{ flex: 1, minWidth: 0 }}>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Sent on">
        <DateInput className="input" value={sentOn} max={todayLocal()} onChange={(e) => setSentOn(e.target.value)} />
      </Field>

      <RateLine rate={rate} currency={currency} estimate={estimate} />

      <Field label="Pesos that arrived">
        <input className="input" type="number" inputMode="decimal" step="0.01" min="0" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={estimate ? String(Math.floor(estimate)) : "28000"} />
      </Field>
      {estimate !== null && !received && (
        <button type="button" className="btn btn-secondary" style={{ minHeight: "2.25rem", fontSize: "0.78125rem", margin: "-0.25rem 0 0.875rem" }} onClick={() => setReceived(String(estimate))}>
          Use {formatCurrency(estimate)}
        </button>
      )}
      {estimate !== null && arrived > 0 && Math.abs(estimate - arrived) >= 1 && (
        <p style={NOTE}>
          {arrived < estimate
            ? `${formatCurrency(Math.round(estimate - arrived))} less than the reference rate — the sending fee and the centre's margin, together.`
            : `${formatCurrency(Math.round(arrived - estimate))} more than the reference rate.`}
        </p>
      )}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="How it came" style={{ flex: 1, minWidth: 0 }}>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as RemittanceChannel)}>
            {REMITTANCE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {REMITTANCE_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        {(channel === "remittance_centre" || channel === "bank" || channel === "other") && (
          <Field label={channel === "bank" ? "Which bank" : channel === "other" ? "Which" : "Which centre"} style={{ flex: 1, minWidth: 0 }}>
            <input
              className="input"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder={channel === "bank" ? "BDO" : channel === "other" ? "Remitly" : "Palawan"}
              maxLength={120}
            />
          </Field>
        )}
      </div>

      <Field label="Landed in (optional)">
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Not in an account on Kin</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id} disabled={justMe && a.isJoint}>
              {a.name}
              {a.isJoint ? " · joint" : ""}
            </option>
          ))}
        </select>
      </Field>
      {selectedAccount && (
        <p style={NOTE}>
          {arrived > 0 ? formatCurrency(arrived) : "The pesos that arrived"} will show as money in on {selectedAccount.name}, so its balance stays right.
        </p>
      )}

      <div className="kin-eyebrow" style={{ margin: "18px 0 8px" }}>WHAT IT WENT TO</div>
      {allocations.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "0.5rem" }}>
          <Field label="For" style={{ flex: 1.5, minWidth: 0, marginBottom: 0 }}>
            <input
              className="input"
              value={a.purpose}
              onChange={(e) => setAllocations(allocations.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)))}
              placeholder={["Tuition", "Lola's medicine", "House repairs"][i % 3]}
              maxLength={80}
            />
          </Field>
          <Field label="₱" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={a.amount}
              onChange={(e) => setAllocations(allocations.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
            />
          </Field>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={`Remove ${a.purpose || "this part"}`}
            style={{ minHeight: "2.75rem", minWidth: "2.75rem", padding: 0 }}
            onClick={() => setAllocations(allocations.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.25rem 0 0.875rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: "2.25rem", fontSize: "0.78125rem" }}
          onClick={() => setAllocations([...allocations, { purpose: "", amount: "", category: "" }])}
        >
          + Add a part
        </button>
        {allocations.length > 0 && arrived > 0 && (
          <span style={{ fontSize: "0.78125rem", color: allocated > arrived ? "var(--color-accent-700)" : "var(--color-neutral-600)", fontVariantNumeric: "tabular-nums" }}>
            {allocated > arrived ? `${formatCurrency(allocated - arrived)} more than arrived` : `${formatCurrency(arrived - allocated)} not yet assigned`}
          </span>
        )}
      </div>

      <Field label="Note (optional)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For October" maxLength={1000} />
      </Field>

      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5625rem", fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "2px 0 16px" }}>
        <input
          type="checkbox"
          checked={justMe}
          onChange={(e) => {
            setJustMe(e.target.checked);
            if (e.target.checked && selectedAccount?.isJoint) setAccountId("");
          }}
          style={{ marginTop: "0.2rem" }}
        />
        <span>
          Just me
          <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
            Only you will see this remittance. It can land only in an account of your own.
          </span>
        </span>
      </label>

      <button type="button" className="btn btn-primary btn-block" disabled={pending} style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }} onClick={submit}>
        {pending ? "…" : "Log remittance"}
      </button>
    </div>
  );
}

function RateLine({ rate, currency, estimate }: { rate: PesoRate | null | "loading"; currency: string; estimate: number | null }) {
  let text: string;
  if (rate === "loading") text = "Looking up the rate for that day…";
  else if (!rate) text = currency === "KWD"
    ? "The Kuwaiti dinar has no published reference rate. Type the pesos that arrived."
    : "No reference rate for that day. Type the pesos that arrived.";
  else {
    const day = new Date(`${rate.rateDate}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    const per = `1 ${currency} = ${formatCurrency(Math.round(rate.rate * 10000) / 10000)}`;
    const how = rate.source === "usd_peg" ? `ECB dollar rate on ${day}, through the ${currency}'s fixed peg` : `ECB rate on ${day}`;
    text = `${per} · ${how}${estimate !== null ? ` · about ${formatCurrency(Math.round(estimate))}` : ""}. Remittance centres usually pay a little less.`;
  }
  return (
    <p aria-live="polite" style={{ ...NOTE, marginTop: "-0.25rem" }}>
      {text}
    </p>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={{ marginBottom: "0.875rem", ...style }}>
      <label>
        {label}
        {children}
      </label>
    </div>
  );
}
