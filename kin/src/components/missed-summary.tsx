"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { KIN_AI_PRIVACY } from "@/lib/kin-ai";
import { missedDigestAction, summariseThreadAction } from "@/lib/actions/chat-summary";
import type { MissedDigest } from "@/lib/chat-summary";

/** "What did I miss?" (Kin Plus, 20 October; Quick look for every plan,
 * 29 October). Shown above a thread that
 * has about thirty or more unread messages: the count, one button, and the
 * privacy line. The summary comes back once, is shown here, and is kept
 * nowhere -- close it or leave the page and it is gone. `since` is the
 * last-read time the page captured before the thread marked itself read,
 * so the summary covers exactly the messages counted. */
export function MissedSummary({ thread, since, count, threadName, peerName, plus, ready }: { thread: string; since: string; count: number; threadName: string; peerName?: string; plus: boolean; ready: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [digest, setDigest] = useState<MissedDigest | null>(null);
  const [pending, start] = useTransition();
  if (gone) return null;

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await summariseThreadAction({ thread, since, threadName, peerName });
      if (r.error) setError(r.error);
      else setSummary(r.summary);
    });

  // The free catch-up (29 October): no Kin AI, every plan.
  const look = () =>
    start(async () => {
      setError(null);
      const r = await missedDigestAction({ thread, since, peerName });
      if (r.error) setError(r.error);
      else setDigest(r.digest);
    });

  return (
    <aside className="kin-missed" aria-label="What did I miss?">
      <div className="kin-missed-head">
        <Icon name="sparkle" size={16} />
        <span style={{ flex: 1 }}>
          <b>{count >= 200 ? "200+" : count} unread messages</b> since you were last here.
        </span>
        <button type="button" className="btn btn-secondary btn-icon" style={{ width: 28, height: 28 }} aria-label="Close" onClick={() => setGone(true)}>
          <Icon name="x" size={13} />
        </button>
      </div>
      {summary ? (
        <>
          <p className="kin-missed-text">{summary}</p>
          <p className="kin-missed-note">Shown once and not saved; scroll up for the messages themselves.</p>
        </>
      ) : (
        <>
          {digest && <DigestView digest={digest} />}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            {plus && ready && (
              <button type="button" className="btn btn-primary" style={{ minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.875rem" }} onClick={ask} disabled={pending}>
                {pending ? "Reading…" : "What did I miss?"}
              </button>
            )}
            {!digest && (
              <button type="button" className={`btn ${plus && ready ? "btn-secondary" : "btn-primary"}`} style={{ minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.875rem" }} onClick={look} disabled={pending}>
                Quick look
              </button>
            )}
          </div>
          {!plus ? (
            <p className="kin-missed-note">
              Quick look is free: who wrote, the questions, and where you were named. A written catch-up by Kin AI is part of <b>Kin Plus</b>.{" "}
              <Link href="/subscribe" className="kin-web-only">
                See plans
              </Link>
            </p>
          ) : !ready ? (
            <p className="kin-missed-note">Kin AI isn&apos;t switched on yet; Quick look works without it.</p>
          ) : null}
          {error && (
            <p role="alert" className="kin-missed-note" style={{ color: "var(--color-accent-700)" }}>
              {error}
            </p>
          )}
        </>
      )}
      {plus && ready && <p className="kin-missed-note">{KIN_AI_PRIVACY} The unread messages are sent, nothing else, and the summary is not kept.</p>}
    </aside>
  );
}

/** Quick look: counts, then the questions and mentions, newest first. */
function DigestView({ digest }: { digest: MissedDigest }) {
  const list = { margin: "0.25rem 0 0.5rem", paddingLeft: "1.1rem", display: "grid", gap: "0.25rem" } as const;
  return (
    <div className="kin-missed-text" style={{ whiteSpace: "normal" }}>
      <p style={{ margin: 0 }}>{digest.from.map((f) => `${f.who} ${f.count}`).join(" · ")}</p>
      {digest.mentions.length > 0 && (
        <>
          <p style={{ margin: "0.5rem 0 0", fontWeight: 600 }}>You were named</p>
          <ul style={list}>{digest.mentions.map((m) => <li key={m.at + m.who}>{m.who}: {m.body}</li>)}</ul>
        </>
      )}
      {digest.asks.length > 0 && (
        <>
          <p style={{ margin: "0.5rem 0 0", fontWeight: 600 }}>Questions</p>
          <ul style={list}>{digest.asks.map((m) => <li key={m.at + m.who}>{m.who}: {m.body}</li>)}</ul>
        </>
      )}
    </div>
  );
}
