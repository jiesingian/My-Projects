"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendLinkMessageAction, deleteLinkMessageAction } from "@/lib/actions/family-links";
import { toggleRoomReactionAction } from "@/lib/actions/chat-rooms";
import { REACTIONS } from "@/lib/chat";
import { familyClock, familyDateLong } from "@/lib/time";
import { Icon } from "@/components/icons";
import type { LinkMessage } from "@/lib/queries/family-links";

/** The thread between two linked households. Deliberately plainer than the
 * household's own chat: this is where a cousin says congratulations or an aunt
 * sends news, not where a house runs its day. */
export function LinkThread({ linkId, initial, ourName, theirName }: { linkId: string; initial: LinkMessage[]; ourName: string; theirName: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** The message whose reactions are open -- tap a message, as everywhere
   * else in the chat. */
  const [active, setActive] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const react = (id: string, emoji: string) =>
    startTransition(async () => {
      setActive(null);
      const r = await toggleRoomReactionAction("link", id, emoji);
      if (r.error) setError(r.error);
      router.refresh();
    });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [initial.length]);

  // Live, per link. Row-level security decides what arrives, so a household
  // that is not on this link receives nothing on it.
  // Private (20260926130000_private_chat_channels.sql): only the two linked
  // households may join.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      await supabase.realtime.setAuth().catch(() => {});
      if (cancelled) return;
      channel = supabase
        .channel(`family-link:${linkId}`, { config: { private: true } })
        .on("postgres_changes", { event: "*", schema: "public", table: "family_link_messages", filter: `link_id=eq.${linkId}` }, () => router.refresh())
        // Row-level security sends only reactions on messages this household
        // can read (20260930041000).
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_reactions" }, () => router.refresh())
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [linkId, router]);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError(null);
    startTransition(async () => {
      const r = await sendLinkMessageAction(linkId, body);
      if (r.error) {
        setError(r.error);
        setDraft(body);
      }
      router.refresh();
    });
  };

  // Day breaks worked out before rendering, not by mutating a variable inside
  // it -- a render has to give the same answer however many times it runs.
  const rows = initial.map((m, i) => {
    const day = familyDateLong(new Date(m.createdAt));
    const prev = initial[i - 1];
    return { m, day, showDay: !prev || familyDateLong(new Date(prev.createdAt)) !== day };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ flex: 1 }}>
        {initial.length === 0 && (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", textAlign: "center", padding: "2rem 1rem", lineHeight: 1.5 }}>
            Nothing said yet. Say hello to the {theirName} household.
          </p>
        )}
        {rows.map(({ m, day, showDay }) => {
          return (
            <div key={m.id}>
              {showDay && <div className="kin-linkthread-day">{day}</div>}
              <div style={{ display: "flex", justifyContent: m.ourHousehold ? "flex-end" : "flex-start", marginTop: "0.5rem" }}>
                <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: m.ourHousehold ? "flex-end" : "flex-start" }}>
                  <span className="kin-linkthread-who">
                    {m.authorName} · {m.ourHousehold ? ourName : theirName}
                  </span>
                  <button
                    type="button"
                    className="kin-bubble"
                    data-mine={m.ourHousehold || undefined}
                    style={{ whiteSpace: "pre-wrap", textAlign: "left", font: "inherit", border: 0 }}
                    aria-expanded={active === m.id}
                    onClick={() => setActive((a) => (a === m.id ? null : m.id))}
                  >
                    {m.body}
                  </button>
                  {m.reactions.length > 0 && (
                    <span className="kin-room-reactions">
                      {m.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          data-mine={r.mine || undefined}
                          disabled={pending}
                          onClick={() => react(m.id, r.emoji)}
                          aria-label={`${r.emoji} from ${r.names.join(", ")}`}
                          title={r.names.join(", ")}
                        >
                          {r.emoji} {r.names.length > 1 ? r.names.length : ""}
                        </button>
                      ))}
                    </span>
                  )}
                  {active === m.id && (
                    <span className="kin-room-actions" role="group" aria-label="React">
                      {REACTIONS.map((e) => (
                        <button key={e} type="button" disabled={pending} onClick={() => react(m.id, e)} aria-label={`React ${e}`}>
                          {e}
                        </button>
                      ))}
                    </span>
                  )}
                  <span className="kin-linkthread-time">
                    {familyClock(new Date(m.createdAt))}
                    {m.mine && (
                      <button
                        type="button"
                        className="kin-linkthread-delete"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await deleteLinkMessageAction(m.id, linkId);
                            if (r.error) setError(r.error);
                            router.refresh();
                          })
                        }
                      >
                        Delete
                      </button>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {error && (
        <p role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", margin: "0.375rem 0 0" }}>
          {error}
        </p>
      )}

      <div className="kin-glass-bar kin-composer">
        <div className="kin-composer-row">
          <textarea
            className="input kin-composer-field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Message the ${theirName} household…`}
            rows={1}
            maxLength={2000}
            aria-label={`Message the ${theirName} household`}
            style={{ minHeight: "2.375rem", maxHeight: "7.5rem", fontSize: "0.9375rem", resize: "none", paddingTop: "0.5625rem" }}
          />
          <button
            type="button"
            className="btn btn-primary btn-icon"
            style={{ width: "2.375rem", height: "2.375rem", flex: "none" }}
            disabled={pending || !draft.trim()}
            onClick={send}
            aria-label="Send"
          >
            <Icon name="upload" size="1rem" />
          </button>
        </div>
      </div>
    </div>
  );
}
