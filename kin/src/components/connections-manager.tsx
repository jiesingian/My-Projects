"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Blueprint } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
import { confirm } from "@/components/confirm-sheet";
import { initials } from "@/lib/format";
import {
  newConnectionCodeAction,
  removeConnectionAction,
  requestConnectionAction,
  requestConnectionByCodeAction,
  respondConnectionAction,
} from "@/lib/actions/connections";
import type { ActionState } from "@/lib/actions/auth";
import type { Connection, ConnectionCandidate } from "@/lib/queries/connections";

const initialState: ActionState = { error: null };

const eyebrow: React.CSSProperties = { font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", margin: "1.375rem 0 0.5rem" };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6875rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", flexWrap: "wrap" };
const sub: React.CSSProperties = { fontSize: "0.78125rem", color: "var(--color-neutral-600)" };

export function ConnectionsManager({
  connections,
  candidates,
  ownCode,
  canUseCodes,
  prefillCode,
}: {
  connections: Connection[];
  candidates: ConnectionCandidate[];
  ownCode: string | null;
  canUseCodes: boolean;
  prefillCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, formAction] = useActionState(requestConnectionByCodeAction, initialState);

  const run = (fn: () => Promise<ActionState>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
      router.refresh();
    });

  const incoming = connections.filter((c) => c.status === "pending" && c.incoming);
  const outgoing = connections.filter((c) => c.status === "pending" && !c.incoming);
  const accepted = connections.filter((c) => c.status === "accepted");

  const share = async () => {
    if (!ownCode) return;
    const url = `${window.location.origin}/family/connections?code=${ownCode}`;
    const text = `Connect with me on Kin: ${url} (or enter my code ${ownCode} under Family → Connections)`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      // Closing the share sheet is not an error.
    }
  };

  const who = (c: Connection) => c.fullName ?? "Request sent";

  return (
    <div>
      <ErrorText message={error} />

      {incoming.length > 0 && (
        <>
          <div style={{ ...eyebrow, marginTop: 0 }}>WANTS TO CONNECT · {incoming.length}</div>
          {incoming.map((c) => (
            <Blueprint key={c.id} className="bg-[var(--color-accent-100)]" style={{ padding: "0.75rem", marginBottom: "0.625rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <Avatar url={c.avatarUrl} initials={initials(who(c))} label={who(c)} size={40} clickable={false} />
              <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
                <span style={{ font: "600 0.9375rem/1.1 var(--font-heading)", display: "block" }}>{who(c)}</span>
                <span style={sub}>{c.householdName ?? ""}</span>
              </span>
              <span style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => respondConnectionAction(c.id, true))}>
                  Accept
                </button>
                <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => respondConnectionAction(c.id, false))}>
                  Decline
                </button>
              </span>
            </Blueprint>
          ))}
        </>
      )}

      <div style={{ ...eyebrow, marginTop: incoming.length ? undefined : 0 }}>YOUR CONNECTIONS · {accepted.length}</div>
      {accepted.length === 0 ? (
        <p style={{ ...sub, margin: 0 }}>No one yet. Ask someone below.</p>
      ) : (
        accepted.map((c) => (
          <div key={c.id} style={row}>
            <Avatar url={c.avatarUrl} initials={initials(who(c))} label={who(c)} size={40} clickable={false} />
            <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
              <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{who(c)}</span>
              <span style={sub}>{c.householdName ?? ""}</span>
            </span>
            <Link href={`/chat/dm/${c.personId}`} className="btn btn-secondary">
              Message
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove ${who(c)}?`,
                  description: "You'll stop being able to message each other one to one. Either of you can ask again later.",
                  confirmLabel: "Remove",
                  danger: true,
                });
                if (ok) run(() => removeConnectionAction(c.id));
              }}
            >
              Remove
            </button>
          </div>
        ))
      )}

      {outgoing.length > 0 && (
        <>
          <div style={eyebrow}>WAITING FOR THEM · {outgoing.length}</div>
          {outgoing.map((c) => (
            <div key={c.id} style={row}>
              <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
                <span style={{ font: "600 0.9375rem/1.1 var(--font-heading)", display: "block" }}>{who(c)}</span>
                <span style={sub}>{c.fullName ? "Waiting for them to accept" : "Asked with a code. You'll see who once they accept."}</span>
              </span>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => removeConnectionAction(c.id))}>
                Withdraw
              </button>
            </div>
          ))}
        </>
      )}

      {candidates.length > 0 && (
        <>
          <div style={eyebrow}>IN YOUR FAMILY</div>
          {candidates.map((p) => (
            <div key={p.personId} style={row}>
              <Avatar url={p.avatarUrl} initials={initials(p.fullName)} label={p.fullName} size={36} clickable={false} />
              <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
                <span style={{ font: "600 0.9375rem/1.1 var(--font-heading)", display: "block" }}>{p.fullName}</span>
                <span style={sub}>{p.sameHousehold ? "Your household" : p.householdName}</span>
              </span>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => requestConnectionAction(p.personId))}>
                Connect
              </button>
            </div>
          ))}
        </>
      )}

      {canUseCodes && (
        <>
          <div style={eyebrow}>SOMEONE OUTSIDE THE FAMILY</div>
          <Blueprint style={{ padding: "0.875rem" }}>
            <form action={formAction} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ flex: "1 1 10rem", minWidth: 0 }}>
                <span style={{ ...sub, display: "block", marginBottom: "0.25rem" }}>Their code</span>
                <input
                  name="code"
                  className="input"
                  defaultValue={prefillCode}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={12}
                  placeholder="8 letters and numbers"
                  style={{ width: "100%", letterSpacing: ".12em", textTransform: "uppercase" }}
                />
              </label>
              <SubmitButton className="btn btn-primary">Ask to connect</SubmitButton>
            </form>
            <ErrorText message={state.error} />
            {ownCode && (
              <div style={{ marginTop: "0.875rem" }}>
                <div style={{ fontSize: "0.71875rem", letterSpacing: ".05em", color: "var(--color-neutral-500)", marginBottom: "0.25rem" }}>
                  YOUR CODE — GIVE THIS TO PEOPLE YOU KNOW
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ font: "600 1.125rem/1 var(--font-numeric)", letterSpacing: ".14em", flex: "1 1 auto" }}>{ownCode}</span>
                  <button type="button" className="btn btn-secondary" onClick={share}>
                    {copied ? "Copied" : "Share link"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={pending}
                    onClick={async () => {
                      const ok = await confirm({ title: "Make a new code?", description: "Your old code and link stop working. People already connected stay connected.", confirmLabel: "New code" });
                      if (ok) run(newConnectionCodeAction);
                    }}
                  >
                    New code
                  </button>
                </div>
                <p style={{ ...sub, margin: "0.375rem 0 0", lineHeight: 1.45 }}>
                  Anyone with your code can ask to connect. Nothing happens until you accept, and they won&rsquo;t see
                  your name until you do.
                </p>
              </div>
            )}
          </Blueprint>
        </>
      )}
    </div>
  );
}
