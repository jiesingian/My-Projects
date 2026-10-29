"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setKinAiOkAction } from "@/lib/actions/kin-ai-ok";
import { KIN_AI_ASK } from "@/lib/kin-ai";

/** Kin AI asks once, before anything of this person's goes to Anthropic
 * (Jonathan, 29 October; App Review 5.1.2(i); 20261030120000_kin_ai_ok.sql).
 * Every Kin AI feature answers KIN_AI_ASK until they say yes; its screen
 * shows this in place of the error. Allow saves the yes and clears the
 * error, so they ask or scan again; Not now just clears it. Settings →
 * Privacy can take it back. */
export function isKinAiAsk(error: string | null | undefined): boolean {
  return error === KIN_AI_ASK;
}

export function KinAiAsk({ onDone }: { onDone: () => void }) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <section className="kin-ai-ask" aria-labelledby="kin-ai-ask-title">
      <h3 id="kin-ai-ask-title">Allow Kin AI?</h3>
      <p>
        Kin AI is Claude, from Anthropic. To answer, Kin sends Anthropic what you ask or scan and the household records
        it needs to look up, which can include health and money records you can see. Anthropic uses it only to answer
        and does not train on it.
      </p>
      <p className="kin-ai-ask-more">
        You can change this in Settings → Privacy. <Link href="/legal/privacy">Privacy notice</Link>
      </p>
      {failed && <p role="alert">{failed}</p>}
      <div className="kin-ai-ask-buttons">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const { error } = await setKinAiOkAction(true);
              if (error) setFailed(error);
              else onDone();
            })
          }
        >
          Allow
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={onDone}>
          Not now
        </button>
      </div>
    </section>
  );
}

/** Settings → Privacy: the same yes, given or taken back. */
export function KinAiSetting({ allowed }: { allowed: boolean }) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(allowed);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <section className="kin-ai-ask" aria-labelledby="kin-ai-setting-title" style={{ marginTop: "1.25rem" }}>
      <h3 id="kin-ai-setting-title">Kin AI</h3>
      <p>
        {on
          ? "Allowed. When you ask Kin AI, scan a flyer, read a statement or catch up on a chat, Kin sends Anthropic what it needs to answer."
          : "Not allowed. Kin AI asks before it sends anything of yours to Anthropic. Ask Kin's own answers still work."}
      </p>
      {failed && <p role="alert">{failed}</p>}
      <div className="kin-ai-ask-buttons">
        <button
          type="button"
          className={on ? "btn btn-secondary" : "btn btn-primary"}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const { error } = await setKinAiOkAction(!on);
              if (error) setFailed(error);
              else {
                setFailed(null);
                setOn(!on);
              }
            })
          }
        >
          {on ? "Stop Kin AI" : "Allow Kin AI"}
        </button>
      </div>
    </section>
  );
}
