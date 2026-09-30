"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatedSheet } from "@/components/animated-sheet";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { forwardMessageAction, listForwardTargetsAction } from "@/lib/actions/chat-rooms";
import { MAX_FORWARD_TARGETS, type ForwardSource, type ForwardTarget } from "@/lib/chat-forward";
import { initials } from "@/lib/format";

/** "Forward to…" (20260930031500): every conversation this person can write
 * in, ticked one or several at a time, then one Send. The list is fetched when
 * the sheet opens rather than carried by every thread page, so a thread that
 * nobody forwards from never pays for it. */
export function ForwardSheet({ source, preview, onClose }: { source: ForwardSource | null; preview: string; onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const [targets, setTargets] = useState<ForwardTarget[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = source !== null;

  useEffect(() => {
    if (!open || targets) return;
    let live = true;
    void listForwardTargetsAction().then((t) => live && setTargets(t));
    return () => {
      live = false;
    };
  }, [open, targets]);

  const close = () => {
    setChosen([]);
    setNote(null);
    onClose();
  };

  const toggle = (key: string) =>
    setChosen((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= MAX_FORWARD_TARGETS ? prev : [...prev, key]));

  const send = () =>
    startTransition(async () => {
      if (!source) return;
      const r = await forwardMessageAction(source, chosen);
      if (r.error) {
        setNote(r.error);
        if (!r.sent) return;
      }
      router.refresh();
      if (!r.error) close();
    });

  return (
    <AnimatedSheet open={open} onClose={close} labelledBy={titleId} panelClassName="sheet-panel--confirm">
      <h2 id={titleId} style={{ fontSize: "1.125rem", margin: "0 0 0.25rem" }}>
        Forward to…
      </h2>
      {preview && <p className="kin-forward-preview">{preview}</p>}
      <div className="kin-forward-list" role="group" aria-label="Conversations">
        {targets === null ? (
          <p className="kin-forward-empty">Loading…</p>
        ) : (
          targets.map((t) => {
            const on = chosen.includes(t.key);
            return (
              <button key={t.key} type="button" className="kin-callpick" aria-pressed={on} data-on={on || undefined} onClick={() => toggle(t.key)}>
                {t.kind === "dm" ? (
                  <Avatar url={t.avatarUrl ?? null} initials={initials(t.title)} label={t.title} size={36} clickable={false} />
                ) : (
                  <span className="kin-forward-icon" aria-hidden="true">
                    <Icon name={t.kind === "household" ? "house" : t.kind === "family" ? "users" : t.kind === "saved" ? "fileText" : "message"} size="1.125rem" />
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <span className="kin-forward-title">{t.title}</span>
                  <span className="kin-forward-sub">{t.subtitle}</span>
                </span>
                <span className="kin-forward-tick" aria-hidden="true">
                  {on && <Icon name="check" size="0.875rem" />}
                </span>
              </button>
            );
          })
        )}
      </div>
      {note && (
        <p role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", margin: "0.5rem 0 0" }}>
          {note}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={close}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={pending || chosen.length === 0} onClick={send}>
          {pending ? "Sending…" : chosen.length > 1 ? `Send to ${chosen.length}` : "Send"}
        </button>
      </div>
    </AnimatedSheet>
  );
}
