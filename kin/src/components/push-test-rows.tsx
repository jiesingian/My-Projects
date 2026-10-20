"use client";

import { useState, useTransition } from "react";
import { Blueprint } from "@/components/ui";
import { sendTestKindPushAction } from "@/lib/actions/push";
import { PUSH_TEST_KINDS, PUSH_TESTS_PER_MINUTE } from "@/lib/push-test";

/** "Send me a test", one row per kind of push (20261020210000): each sends
 * that kind's real words, link and icon, marked "Test: ", to this person's
 * own devices. Grown-ups only; the page does not render it for anyone
 * else, and the database refuses them anyway. */
export function PushTestRows() {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ key: string; text: string; error: boolean } | null>(null);

  const send = (key: string) =>
    startTransition(async () => {
      setBusy(key);
      setSaid(null);
      const r = await sendTestKindPushAction(key);
      setBusy(null);
      if (r.error) setSaid({ key, text: r.error, error: true });
      else setSaid({ key, text: `Sent to ${r.sent === 1 ? "1 device" : `${r.sent} devices`}. It should appear in a few seconds, marked "Test:".`, error: false });
    });

  return (
    <section aria-labelledby="push-tests" style={{ marginTop: "1.25rem" }}>
      <h2 id="push-tests" style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", margin: "0 0 0.375rem" }}>
        SEND ME A TEST
      </h2>
      <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--color-neutral-600)", margin: "0 0 0.625rem" }}>
        One of each kind Kin sends, with its real words and link, to your own devices only. Up to {PUSH_TESTS_PER_MINUTE} a minute.
      </p>
      <Blueprint style={{ paddingLeft: "0.9375rem" }}>
        {PUSH_TEST_KINDS.map((k, i) => (
          <div key={k.key} style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-divider)", padding: "0.5rem 0.9375rem 0.5rem 0" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem 0.875rem", alignItems: "center", minHeight: "3rem" }}>
              <span style={{ flex: "1 1 9rem", minWidth: 0 }}>
                <span style={{ fontSize: "1rem", display: "block" }}>{k.name}</span>
                <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{k.sub}</span>
              </span>
              <button type="button" className="btn btn-secondary" style={{ minHeight: "2.5rem", fontSize: "0.8125rem" }} disabled={pending} onClick={() => send(k.key)}>
                {busy === k.key ? "Sending…" : "Send me a test"}
              </button>
            </div>
            {said?.key === k.key && (
              <p role={said.error ? "alert" : "status"} style={{ fontSize: "0.8125rem", margin: "0.25rem 0 0.25rem", color: said.error ? "var(--color-accent-700)" : "var(--color-neutral-700)" }}>
                {said.text}
              </p>
            )}
          </div>
        ))}
      </Blueprint>
    </section>
  );
}
