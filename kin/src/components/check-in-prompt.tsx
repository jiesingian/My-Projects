"use client";

import { useState, useTransition } from "react";
import { answerCheckInAction } from "@/lib/actions/member-card";
import styles from "./member-card.module.css";

export type PendingCheckIn = { id: string; askedBy: string };

/** "Are you okay?" asked of you, answered with one tap (30 September). Shown
 * on Today until it is answered; the notification opens it too
 * (/today/check-in/<id>). */
export function CheckInPrompt({ checkIns }: { checkIns: PendingCheckIn[] }) {
  if (checkIns.length === 0) return null;
  return (
    <>
      {checkIns.map((c) => (
        <CheckInAnswer key={c.id} id={c.id} askedBy={c.askedBy} />
      ))}
    </>
  );
}

export function CheckInAnswer({ id, askedBy }: { id: string; askedBy: string }) {
  const [sent, setSent] = useState<"ok" | "call_me" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = askedBy.split(" ")[0];

  const answer = (a: "ok" | "call_me") =>
    startTransition(async () => {
      setError(null);
      const res = await answerCheckInAction(id, a);
      if (res.error) setError(res.error);
      else setSent(a);
    });

  if (sent) {
    return (
      <div className={styles.ask} role="status">
        <p>{sent === "ok" ? `Told ${first} you're okay.` : `Asked ${first} to call you.`}</p>
      </div>
    );
  }

  return (
    <div className={styles.ask} role="group" aria-label={`${first} asks if you're okay`}>
      <p>
        <strong>{first}</strong> asks: are you okay?
      </p>
      <div className={styles.askButtons}>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => answer("ok")}>
          I&rsquo;m okay
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => answer("call_me")}>
          Call me
        </button>
      </div>
      {error && (
        <p role="alert" style={{ flexBasis: "100%", fontSize: "0.8125rem", color: "#d13438" }}>
          {error}
        </p>
      )}
    </div>
  );
}
