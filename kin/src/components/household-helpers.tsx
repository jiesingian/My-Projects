"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { InviteQr } from "@/components/invite-qr";
import { confirm } from "@/components/confirm-sheet";
import { addHelperAction, removeHelperAction, renewHelperLinkAction, setHelperAccessAction } from "@/lib/actions/helpers";
import { HELPER_SWITCH_LABEL, switchesSummary, type HelperSwitches } from "@/lib/helper-access";
import { helperJoinUrl } from "@/lib/qr";

export type HouseholdHelper = {
  id: string;
  display_name: string;
  can_see_list: boolean;
  can_see_meals: boolean;
  can_see_kids_plans: boolean;
  claimed_at: string | null;
  invite_code: string | null;
  /** An unused link that has not run out yet, worked out on the server. */
  link_live: boolean;
};

const KEYS = Object.keys(HELPER_SWITCH_LABEL) as (keyof HelperSwitches)[];
const switchesOf = (h: HouseholdHelper): HelperSwitches => ({ list: h.can_see_list, meals: h.can_see_meals, kids: h.can_see_kids_plans });

function SwitchChips({ value, onChange, disabled }: { value: HelperSwitches; onChange: (next: HelperSwitches) => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
      {KEYS.map((k) => (
        <button key={k} type="button" className="chip" data-active={value[k]} aria-pressed={value[k]} disabled={disabled} onClick={() => onChange({ ...value, [k]: !value[k] })}>
          {value[k] && <Icon name="check" size={13} />}
          {HELPER_SWITCH_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

/** The one-time link, as a code, a share button and a QR to scan. */
function HelperLink({ code, householdName }: { code: string; householdName: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = helperJoinUrl(window.location.origin, code);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Kin helper link", text: `Your link to help ${householdName} on Kin:`, url });
        return;
      } catch {
        // Cancelled, or refused: copy it instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  return (
    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ font: "400 1.25rem/1 var(--font-numeric)", letterSpacing: ".04em", overflowWrap: "anywhere" }}>{code}</span>
        <button type="button" className="btn btn-secondary" style={{ marginLeft: "auto", minHeight: "2.5rem", gap: "0.375rem" }} onClick={() => void share()}>
          <Icon name={copied ? "check" : "copy"} size={16} />
          {copied ? "Copied" : "Send the link"}
        </button>
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: 0 }}>Works once, for 7 days. They sign up with their own email, and see only what you switched on.</p>
      <InviteQr code={code} householdName={householdName} helper />
    </div>
  );
}

function HelperRow({ helper, householdName }: { helper: HouseholdHelper; householdName: string }) {
  const [value, setValue] = useState(switchesOf(helper));
  const [code, setCode] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const waiting = !helper.claimed_at;
  const expired = waiting && !helper.link_live && !code;
  const liveCode = code ?? (helper.link_live ? helper.invite_code : null);

  const change = (next: HelperSwitches) => {
    const before = value;
    setValue(next);
    startTransition(async () => {
      const r = await setHelperAccessAction(helper.id, next);
      setError(r.error);
      if (r.error) setValue(before);
    });
  };

  return (
    <li style={{ display: "grid", gap: "0.375rem", padding: "0.75rem 0", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "0.9375rem", overflowWrap: "anywhere" }}>{helper.display_name}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
            {waiting ? (expired ? "Link expired" : "Link not used yet") : switchesSummary(value)}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={`Remove ${helper.display_name}`}
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: `Remove ${helper.display_name}?`,
              description: "They lose access straight away. Lines they added stay on the list.",
              confirmLabel: "Remove",
              danger: true,
            });
            if (!ok) return;
            startTransition(async () => setError((await removeHelperAction(helper.id)).error));
          }}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
      <SwitchChips value={value} onChange={change} disabled={pending} />
      {expired && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: "2.5rem", justifySelf: "start" }}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await renewHelperLinkAction(helper.id);
              setError(r.error);
              setCode(r.code);
              setShowLink(!!r.code);
            })
          }
        >
          Make a new link
        </button>
      )}
      {waiting && liveCode && !showLink && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8125rem", justifySelf: "start" }} onClick={() => setShowLink(true)}>
          Show the link
        </button>
      )}
      {waiting && liveCode && showLink && <HelperLink code={liveCode} householdName={householdName} />}
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>}
    </li>
  );
}

/** Settings → Household: the kasambahay, yaya or driver (20261014206000).
 * A helper is not a member. They get a link of their own and see only what
 * is switched on here: the To-Buy list, the meals, the children's plans --
 * never money, health, chat, photos or anyone's details. */
export function HouseholdHelpers({ helpers, householdName }: { helpers: HouseholdHelper[]; householdName: string }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState<HelperSwitches>({ list: true, meals: true, kids: false });
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const r = await addHelperAction(name, value);
      setError(r.error);
      if (!r.error) {
        setCode(r.code);
        setName("");
      }
    });

  return (
    <div>
      {helpers.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 0.5rem", padding: 0 }}>
          {helpers.map((h) => (
            <HelperRow key={h.id} helper={h} householdName={householdName} />
          ))}
        </ul>
      )}
      {code ? (
        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: "0.875rem" }}>Send this to your helper.</div>
          <HelperLink code={code} householdName={householdName} />
          <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }} onClick={() => setCode(null)}>
            Done
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <input className="input" aria-label="Helper's name" placeholder="Ate Rosa" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} style={{ minHeight: "2.5rem" }} disabled={pending} />
          <SwitchChips value={value} onChange={setValue} disabled={pending} />
          <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem" }} disabled={pending || !name.trim()} onClick={add}>
            {pending ? "…" : "Make a helper link"}
          </button>
        </div>
      )}
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
