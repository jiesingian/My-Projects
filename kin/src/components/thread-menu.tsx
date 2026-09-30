"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
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
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Placed from where the button actually is, and kept on screen. It used to
  // hang leftwards from the button's right edge, which is right in the chat
  // list but, in a conversation's header, where the buttons wrap under the
  // title on a phone, put most of the menu off the left of the screen.
  useLayoutEffect(() => {
    if (!open) return;
    const b = button.current?.getBoundingClientRect();
    const p = panel.current;
    if (!b || !p) return;
    const gutter = 8;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const left = Math.min(Math.max(gutter, b.right - w), window.innerWidth - w - gutter);
    // Below the button, unless that runs off the bottom and there is more room above.
    const below = b.bottom + 6;
    const top = below + h > window.innerHeight - gutter && b.top - 6 - h > gutter ? b.top - 6 - h : below;
    p.style.top = `${top}px`;
    p.style.left = `${Math.max(gutter, left)}px`;
    p.style.visibility = "visible";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!holder.current?.contains(e.target as Node)) setOpen(false);
    };
    // A fixed menu would drift away from its button on scroll, so it closes.
    const shut = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", shut, { passive: true, capture: true });
    window.addEventListener("resize", shut);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", shut, { capture: true });
      window.removeEventListener("resize", shut);
    };
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
        ref={button}
        type="button"
        className="kin-threadmenu-button"
        aria-label="Conversation options"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {muted ? <span aria-hidden="true">🔕</span> : <span aria-hidden="true">⋯</span>}
      </button>
      {open && (
        <div
          ref={panel}
          className="kin-threadmenu-panel"
          role="menu"
          // Hidden until measured and placed, so it never flashes off-screen.
          style={{ visibility: "hidden", top: 0, left: 0 }}
        >
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
