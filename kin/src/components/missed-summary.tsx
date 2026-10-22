"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { KIN_AI_PRIVACY } from "@/lib/kin-ai";
import { summariseThreadAction } from "@/lib/actions/chat-summary";

/** "What did I miss?" (Kin Plus, 20 October). Shown above a thread that
 * has about thirty or more unread messages: the count, one button, and the
 * privacy line. The summary comes back once, is shown here, and is kept
 * nowhere -- close it or leave the page and it is gone. `since` is the
 * last-read time the page captured before the thread marked itself read,
 * so the summary covers exactly the messages counted. */
export function MissedSummary({ thread, since, count, threadName, peerName, plus, ready }: { thread: string; since: string; count: number; threadName: string; peerName?: string; plus: boolean; ready: boolean }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;

  const ask = () =>
    start(async () => {
      setError(null);
      const r = await summariseThreadAction({ thread, since, threadName, peerName });
      if (r.error) setError(r.error);
      else setSummary(r.summary);
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
          {!plus ? (
            <p className="kin-missed-note">
              A short Taglish catch-up of these messages is part of <b>Kin Plus</b>. <Link href="/subscribe">See plans</Link>
            </p>
          ) : !ready ? (
            <p className="kin-missed-note">Kin AI isn&apos;t switched on yet. Scroll up to read what you missed.</p>
          ) : (
            <button type="button" className="btn btn-primary" style={{ minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.875rem" }} onClick={ask} disabled={pending}>
              {pending ? "Reading…" : "What did I miss?"}
            </button>
          )}
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
