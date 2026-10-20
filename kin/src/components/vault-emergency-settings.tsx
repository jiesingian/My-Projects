"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { PlusNote } from "@/components/plus";
import { confirm } from "@/components/confirm-sheet";
import { nameTrustedPersonAction, removeTrustedPersonAction, answerEmergencyRequestAction, dismissEmergencyNoticeAction, setDocShareInEmergencyAction } from "@/lib/actions/vault-emergency";
import { WAIT_DAYS, DEFAULT_WAIT, MAX_TRUSTED, waitLabel, type EmergencyStatus } from "@/lib/vault-emergency";
import type { ActionState } from "@/lib/actions/auth";

export type OwnerRequestView = {
  id: string;
  who: string;
  household: string;
  reason: string;
  status: EmergencyStatus;
  /** Worded on the server, in the household's zone. */
  line: string;
};

/** Emergency access, the household's own side: which grown-up of the house
 * it trusts (20261020235000: within the household, never a relative from a
 * linked one), what they have asked, which parents-only documents may open,
 * and every item opened. Rendered for grown-ups only. Deny, Take back,
 * Remove and the notice's "Got it" work locked or not; naming someone,
 * Allow now, the share list and the log wait for the lock, on the server
 * too. */
export function VaultEmergencySettings({
  trusted,
  candidates,
  requests,
  opened,
  notices,
  parentsOnly,
  isParent,
  plus,
  unlocked,
}: {
  trusted: { id: string; memberId: string; name: string; household: string; waitDays: number }[];
  candidates: { memberId: string; name: string; household: string }[];
  requests: OwnerRequestView[];
  opened: { id: string; line: string }[];
  /** Why a trusted person from another household came off the list. */
  notices: { id: string; body: string }[];
  /** The parents-only documents, which only a parent is handed. */
  parentsOnly: { id: string; title: string; owner: string | null; shared: boolean }[];
  isParent: boolean;
  plus: boolean;
  /** The reader's own lock. Shut, this shows the requests with Deny and Take
   * back, and the list with Remove: saying no never waits for a PIN. */
  unlocked: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choosable = candidates.filter((c) => !trusted.some((t) => t.memberId === c.memberId));
  const [picked, setPick] = useState("");
  // Whoever was picked may have just been named and left the list.
  const pick = choosable.some((c) => c.memberId === picked) ? picked : (choosable[0]?.memberId ?? "");
  const [wait, setWait] = useState<number>(DEFAULT_WAIT);

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });

  const live = requests.filter((r) => r.status === "waiting" || r.status === "open");
  const ended = requests.filter((r) => r.status !== "waiting" && r.status !== "open").slice(0, 3);

  return (
    <Blueprint style={{ padding: "0.875rem", marginTop: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
        <Icon name="shieldCheck" size={15} style={{ color: "var(--color-accent-700)" }} />
        <span style={{ font: "600 0.875rem/1 var(--font-heading)" }}>Emergency access</span>
      </div>
      <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 0.75rem" }}>
        Parents-only documents are read by whoever set this household up. If they can&rsquo;t be reached, a grown-up of this
        household you trust can ask to read the vault, with the parents-only documents marked &ldquo;Share in an emergency&rdquo;.
        Every other grown-up here is told at once and each day it waits, and any of them can say no. Up to {MAX_TRUSTED} people.
      </p>

      {error && <p className="kin-vault-error" role="alert">{error}</p>}

      {notices.map((n) => (
        <div key={n.id} role="status" style={{ padding: "0.625rem 0.75rem", borderRadius: "0.625rem", background: "var(--color-neutral-100)", marginBottom: "0.625rem" }}>
          <div style={{ fontSize: "0.8125rem", lineHeight: 1.45 }}>{n.body}</div>
          <button type="button" className="kin-vault-text" style={{ marginTop: "0.375rem" }} disabled={pending} onClick={() => run(() => dismissEmergencyNoticeAction(n.id))}>
            Got it
          </button>
        </div>
      ))}

      {live.map((r) => (
        <div key={r.id} style={{ padding: "0.625rem 0.75rem", borderRadius: "0.625rem", background: "var(--color-accent-100)", marginBottom: "0.625rem" }}>
          <div style={{ font: "600 0.875rem/1.3 var(--font-heading)" }}>
            {r.status === "waiting" ? `${r.who} is asking to open the vault` : `The vault is open to ${r.who}`}
          </div>
          <div className="kin-vault-sub">
            {r.household} · &ldquo;{r.reason}&rdquo;
          </div>
          <div style={{ fontSize: "0.8125rem", margin: "0.25rem 0 0.5rem" }}>{r.line}</div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {r.status === "waiting" ? (
              <>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => answerEmergencyRequestAction(r.id, "deny"))}>
                  Deny
                </button>
                {unlocked && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    disabled={pending}
                    onClick={async () => {
                      if (!(await confirm({ title: `Open the vault to ${r.who} now?`, description: "Read-only, for 30 days or until a grown-up here takes it back.", confirmLabel: "Allow now" }))) return;
                      run(() => answerEmergencyRequestAction(r.id, "allow"));
                    }}
                  >
                    Allow now
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => answerEmergencyRequestAction(r.id, "revoke"))}>
                Take back access
              </button>
            )}
          </div>
        </div>
      ))}

      {trusted.map((t) => (
        <div key={t.id} className="kin-vault-item">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kin-vault-label">{t.name}</div>
            <div className="kin-vault-sub">Waits {waitLabel(t.waitDays)}</div>
          </div>
          <div className="kin-vault-actions">
            <button
              type="button"
              className="kin-vault-text"
              disabled={pending}
              onClick={async () => {
                if (!(await confirm({ title: `Remove ${t.name}?`, description: "Any access they have ends now.", confirmLabel: "Remove", danger: true }))) return;
                run(() => removeTrustedPersonAction(t.id));
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {!unlocked && (
        <p className="kin-vault-empty" style={{ margin: "0.625rem 0 0" }}>
          Unlock above to name someone, allow a request early, or see what was opened.
        </p>
      )}

      {unlocked && trusted.length < MAX_TRUSTED &&
        (!plus ? (
          <PlusNote area="Naming someone" detail="Anyone already named stays on the list, and their access works as before." />
        ) : choosable.length === 0 ? (
          <p className="kin-vault-empty" style={{ marginTop: "0.625rem" }}>
            Nobody to choose yet. Only another grown-up of this household with Kin can be named.
          </p>
        ) : (
          <div className="kin-vault-form">
            <div className="field">
              <label htmlFor={`${uid}-who`}>Trusted person</label>
              <select id={`${uid}-who`} className="input" value={pick} onChange={(e) => setPick(e.target.value)} disabled={pending}>
                {choosable.map((c) => (
                  <option key={c.memberId} value={c.memberId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="kin-vault-who" disabled={pending}>
              <legend>WAIT BEFORE IT OPENS</legend>
              {WAIT_DAYS.map((d) => (
                <label key={d}>
                  <input type="radio" name={`${uid}-wait`} checked={wait === d} onChange={() => setWait(d)} /> {waitLabel(d)}
                </label>
              ))}
            </fieldset>
            <button type="button" className="btn btn-secondary btn-block" disabled={pending || !pick} onClick={() => run(() => nameTrustedPersonAction(pick, wait))}>
              {pending ? "Saving…" : "Name them"}
            </button>
          </div>
        ))}

      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0" }}>
        Documents kept in Google Drive can&rsquo;t be shared this way, only those kept in Kin.
      </p>

      {unlocked && isParent && (
        <div style={{ marginTop: "0.875rem" }}>
          <div style={{ font: "600 0.75rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", marginBottom: "0.375rem" }}>
            SHARE IN AN EMERGENCY
          </div>
          {parentsOnly.length === 0 ? (
            <p className="kin-vault-empty" style={{ margin: 0 }}>
              No parents-only documents. &ldquo;Whole family&rdquo; documents and the passwords are shared when access opens.
            </p>
          ) : (
            <>
              <p className="kin-vault-sub" style={{ margin: "0 0 0.375rem" }}>
                Parents-only documents stay out of emergency access unless ticked here or on the document.
              </p>
              {parentsOnly.map((d) => (
                <label key={d.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: "2.5rem", fontSize: "0.875rem" }}>
                  <input type="checkbox" checked={d.shared} disabled={pending} onChange={(e) => run(() => setDocShareInEmergencyAction(d.id, e.target.checked))} />
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {d.title}
                    {d.owner ? <span className="kin-vault-sub"> · {d.owner}</span> : null}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {unlocked && (opened.length > 0 || ended.length > 0) && (
        <div style={{ marginTop: "0.875rem" }}>
          <div style={{ font: "600 0.75rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", marginBottom: "0.375rem" }}>
            WHAT HAPPENED
          </div>
          {opened.map((o) => (
            <div key={o.id} className="kin-vault-sub" style={{ padding: "0.25rem 0" }}>
              {o.line}
            </div>
          ))}
          {ended.map((r) => (
            <div key={r.id} className="kin-vault-sub" style={{ padding: "0.25rem 0" }}>
              {r.who} asked (&ldquo;{r.reason}&rdquo;). {r.line}
            </div>
          ))}
        </div>
      )}
    </Blueprint>
  );
}
