"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { addReadyItemAction, askEveryoneAction, removeReadyItemAction, setTyphoonModeAction, startReadyChecklistAction, tickReadyItemAction } from "@/lib/actions/typhoon";
import { readyProgress, type ReadyItem } from "@/lib/typhoon";

/** Typhoon mode's switch (a grown-up), on Family -> Get ready. */
export function TyphoonSwitch({ on, canChange }: { on: boolean; canChange: boolean }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Blueprint style={{ padding: "0 0 0 0.9375rem", marginBottom: "0.875rem" }}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={!canChange || pending}
        onClick={() => {
          const next = !value;
          setValue(next);
          start(async () => {
            const r = await setTyphoonModeAction(next);
            if (r.error) {
              setValue(!next);
              toast.error(r.error);
            } else router.refresh();
          });
        }}
        style={{ width: "100%", textAlign: "left", cursor: canChange ? "pointer" : "default", background: "none", border: 0, padding: "0.6875rem 0.9375rem 0.6875rem 0", display: "flex", gap: "0.875rem", alignItems: "center", minHeight: "3.5rem", font: "inherit", color: "inherit" }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "1.0625rem", display: "block" }}>Typhoon mode</span>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", display: "block", lineHeight: 1.4, marginTop: "0.125rem" }}>
            When a storm or a long brownout is coming: Today leads with this checklist, the emergency card and one tap to ask everyone if they&rsquo;re okay. Switch it off when it has passed.
            {!canChange && " A grown-up switches it."}
          </span>
        </span>
        <span className="kin-switch" data-on={value} />
      </button>
    </Blueprint>
  );
}

/** The household's checklist: everyone ticks, adds and removes. */
export function ReadyChecklist({ items }: { items: ReadyItem[] }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState("");
  const router = useRouter();
  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  const p = readyProgress(items);

  if (items.length === 0)
    return (
      <Blueprint style={{ padding: "0.875rem 0.9375rem" }}>
        <p style={{ margin: "0 0 0.625rem", fontSize: "0.875rem" }}>A go-bag and house list to start from: water, food, light, power, medicines, papers and cash. Change it to fit your home.</p>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(startReadyChecklistAction)}>
          Start the checklist
        </button>
      </Blueprint>
    );

  return (
    <Blueprint style={{ padding: "0.5rem 0.9375rem 0.875rem" }}>
      <p style={{ margin: "0.375rem 0 0.5rem", fontSize: "0.8125rem", color: p.all ? "var(--color-success-700, var(--color-accent-700))" : "var(--color-neutral-600)" }}>{p.all ? "All ready." : p.line}</p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((it) => (
          <li key={it.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem", minHeight: "2.75rem", borderTop: "1px solid var(--color-divider)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.625rem", flex: 1, minWidth: 0, cursor: "pointer" }}>
              <input type="checkbox" checked={!!it.done_at} disabled={pending} onChange={(e) => run(() => tickReadyItemAction(it.id, e.target.checked))} style={{ width: 20, height: 20 }} />
              <span style={{ fontSize: "0.9375rem", textDecoration: it.done_at ? "line-through" : undefined, color: it.done_at ? "var(--color-neutral-600)" : undefined }}>{it.label}</span>
            </label>
            <button type="button" className="kin-potluck-remove" aria-label={`Remove ${it.label}`} disabled={pending} onClick={() => run(() => removeReadyItemAction(it.id))}>
              <Icon name="x" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        style={{ display: "flex", gap: "0.5rem", marginTop: "0.625rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addReadyItemAction(draft), () => setDraft(""));
        }}
      >
        <input className="input" aria-label="Add something to get ready" placeholder="Add something…" value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" className="btn btn-secondary" disabled={pending || !draft.trim()}>
          Add
        </button>
      </form>
    </Blueprint>
  );
}

/** "Are you okay?" to everyone with Kin on a phone, in one tap (a grown-up). */
export function AskEveryoneButton({ block = false }: { block?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`btn btn-secondary${block ? " btn-block" : ""}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await askEveryoneAction();
          if (r.error) toast.error(r.error);
          else toast.success(`Asked ${r.asked === 1 ? "1 person" : `${r.asked} people`} if they're okay.`);
        })
      }
    >
      {pending ? "Asking…" : "Ask everyone if they're okay"}
    </button>
  );
}
