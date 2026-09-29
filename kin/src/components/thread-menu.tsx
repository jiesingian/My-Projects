"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { setThreadPrefAction } from "@/lib/actions/chat-rooms";

/** The "⋯" on a conversation (29 September): pin it to the top of the chat
 * list, or mute its notifications for a while or until turned back on. Only
 * ever your own choice -- nobody else can see that you muted them. */
export function ThreadMenu({ thread, muted, pinned, mutedUntil }: { thread: string; muted: boolean; pinned: boolean; mutedUntil: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!holder.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const change = (c: Parameters<typeof setThreadPrefAction>[1]) =>
    startTransition(async () => {
      await setThreadPrefAction(thread, c);
      setOpen(false);
      router.refresh();
    });

  const until = mutedUntil
    ? new Date(mutedUntil).toLocaleString("en-US", { timeZone: "Asia/Manila", weekday: "short", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div ref={holder} className="kin-threadmenu">
      <button
        type="button"
        className="kin-threadmenu-button"
        aria-label="Conversation options"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {muted ? <span aria-hidden="true">🔕</span> : <span aria-hidden="true">⋯</span>}
      </button>
      {open && (
        <div className="kin-threadmenu-panel" role="menu">
          <button type="button" role="menuitem" disabled={pending} onClick={() => change({ pinned: !pinned })}>
            {pinned ? "Unpin from the top" : "Pin to the top of Chat"}
          </button>
          {muted ? (
            <button type="button" role="menuitem" disabled={pending} onClick={() => change({ mute: "off" })}>
              Turn notifications back on{until ? ` (muted until ${until})` : ""}
            </button>
          ) : (
            <>
              <span className="kin-threadmenu-label">Mute notifications</span>
              <button type="button" role="menuitem" disabled={pending} onClick={() => change({ mute: "1h" })}>
                For an hour
              </button>
              <button type="button" role="menuitem" disabled={pending} onClick={() => change({ mute: "8h" })}>
                For 8 hours
              </button>
              <button type="button" role="menuitem" disabled={pending} onClick={() => change({ mute: "1w" })}>
                For a week
              </button>
              <button type="button" role="menuitem" disabled={pending} onClick={() => change({ mute: "always" })}>
                Until I turn them back on
              </button>
            </>
          )}
          <button type="button" className="kin-threadmenu-close" onClick={() => setOpen(false)} aria-label="Close">
            <Icon name="x" size="0.875rem" />
          </button>
        </div>
      )}
    </div>
  );
}
