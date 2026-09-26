"use client";

import { useId, useState } from "react";
import { AnimatedSheet } from "@/components/animated-sheet";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { useCalls } from "@/components/call-provider";
import { initials } from "@/lib/format";

/** The voice and video call buttons at the top of the chat. With one other
 * person to call it rings them straight away; with more it asks who. Only
 * members with a login of their own can be called: a managed child has no
 * phone of their own in Kin to ring. */
export function CallButtons() {
  const calls = useCalls();
  const [picking, setPicking] = useState<null | boolean>(null);
  const titleId = useId();
  if (!calls) return null;
  const others = calls.members.filter((m) => m.id !== calls.me && m.callable);
  if (others.length === 0) return null;

  const choose = (video: boolean) => (others.length === 1 ? calls.start(others[0].id, video) : setPicking(video));

  return (
    <>
      <div className="kin-callbuttons">
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Voice call" disabled={calls.busy} onClick={() => choose(false)}>
          <Icon name="phone" size="1.125rem" />
        </button>
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Video call" disabled={calls.busy} onClick={() => choose(true)}>
          <Icon name="video" size="1.125rem" />
        </button>
      </div>
      <AnimatedSheet open={picking !== null} onClose={() => setPicking(null)} labelledBy={titleId} panelClassName="sheet-panel--confirm">
        <h2 id={titleId} style={{ fontSize: "1.125rem", margin: "0 0 0.75rem" }}>
          {picking ? "Video call" : "Voice call"} who?
        </h2>
        <div style={{ display: "grid", gap: "0.375rem" }}>
          {others.map((m) => (
            <button
              key={m.id}
              type="button"
              className="kin-callpick"
              onClick={() => {
                const video = picking ?? false;
                setPicking(null);
                calls.start(m.id, video);
              }}
            >
              <Avatar url={m.photoUrl} initials={initials(m.name)} label={m.name} size={40} clickable={false} />
              <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>{m.name}</span>
              <Icon name={picking ? "video" : "phone"} size="1.125rem" />
            </button>
          ))}
        </div>
      </AnimatedSheet>
    </>
  );
}
