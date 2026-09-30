"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useOnline } from "@/components/offline-sync";
import { enqueue, getSnapshot, listQueue, onStoreChange, type Queued } from "@/lib/offline/store";
import { describeSync, refreshSnapshot, replayQueue } from "@/lib/offline/sync";
import type { OfflineSnapshot, QueuedOp } from "@/lib/offline/types";

type View = "today" | "list" | "planner" | "chat" | "sos";

const VIEWS: { id: View; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "list", label: "List" },
  { id: "planner", label: "Planner" },
  { id: "chat", label: "Chat" },
  { id: "sos", label: "SOS" },
];

/** Which screen to open on, from where the person was going. */
function viewFor(from: string): View {
  if (from.startsWith("/household")) return "list";
  if (from.startsWith("/planner")) return "planner";
  if (from.startsWith("/chat")) return "chat";
  if (/^\/family\/members\/[^/]+\/emergency/.test(from)) return "sos";
  return "today";
}

/** "3:42 pm", or "Tue 3:42 pm" when it was not today. */
function savedAt(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

/** Offline Kin: what was saved on this phone, read-only apart from the four
 * changes that can wait for a connection (lib/offline/types, QueuedOp). */
export function OfflineApp() {
  const online = useOnline();
  const [snap, setSnap] = useState<OfflineSnapshot | null | undefined>(undefined);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [from, setFrom] = useState("/today");
  const [view, setView] = useState<View>("today");
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const [s, q] = await Promise.all([getSnapshot().catch(() => null), listQueue()]);
    setSnap(s);
    setQueue(q);
  }, []);

  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("from") ?? "";
    // Only a path inside Kin; anything else would make "Open Kin" a way out.
    const safe = target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/offline") ? target : "/today";
    Promise.resolve().then(() => {
      setFrom(safe);
      setView(viewFor(safe));
    });
    void Promise.resolve().then(load);
    return onStoreChange(() => void load());
  }, [load]);

  // Back online: send what is waiting, then fetch a fresh copy. The browser
  // saying "online" only means there is a network; a lift's Wi-Fi is one. So
  // Kin counts as reachable only once the snapshot has actually come back,
  // and tries again every fifteen seconds until it does.
  const [reachable, setReachable] = useState(false);
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      setSyncing(true);
      const summary = await replayQueue();
      const ok = await refreshSnapshot();
      if (cancelled) return;
      setSyncing(false);
      setReachable(ok);
      if (ok) {
        const said = summary && describeSync(summary);
        setNotice(said ? said.message : "Back online.");
      } else timer = setTimeout(attempt, 15_000);
    };
    void attempt();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setReachable(false);
      setSyncing(false);
    };
  }, [online]);
  const connected = online && reachable;

  const add = useCallback(async (op: QueuedOp) => {
    const ok = await enqueue(op);
    if (!ok) setNotice("Too many changes are waiting. Kin will take more once these have synced.");
  }, []);

  if (snap === undefined) return <div className="kin-offline" aria-busy="true" />;
  if (!snap) return <NothingSaved online={connected} from={from} />;

  const views = VIEWS.filter((v) => !(snap.kidView && (v.id === "list" || v.id === "sos")));
  const current = views.some((v) => v.id === view) ? view : "today";
  const waiting = queue.length;

  return (
    <div className="kin-offline">
      <div className={`kin-offline-status${connected ? " is-online" : ""}`} role="status" aria-live="polite">
        <Icon name={connected ? "check" : "wifi"} size={15} />
        <span style={{ flex: 1, minWidth: 0 }}>
          {connected
            ? (notice ?? "Back online.")
            : `Offline — showing what was saved at ${savedAt(snap.savedAt)}`}
          {!connected && waiting > 0 && (
            <span className="kin-offline-sub">
              {waiting} change{waiting === 1 ? "" : "s"} waiting to sync
            </span>
          )}
        </span>
        {connected && (
          <a className="btn btn-primary" href={from} style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}>
            Open Kin
          </a>
        )}
      </div>
      {!connected && notice && <p className="kin-offline-note">{notice}</p>}

      <nav className="kin-offline-tabs" aria-label="Saved screens">
        {views.map((v) => (
          <button key={v.id} type="button" aria-pressed={v.id === current} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>

      <div className="kin-offline-body">
        {current === "today" && <TodayView snap={snap} queue={queue} onMark={add} />}
        {current === "list" && snap.shopping && <ListView groups={snap.shopping} queue={queue} onChange={add} />}
        {current === "planner" && <PlannerView snap={snap} />}
        {current === "chat" && <ChatView snap={snap} queue={queue} online={connected || syncing} onSend={add} />}
        {current === "sos" && snap.emergency && <SosView cards={snap.emergency} />}
      </div>
    </div>
  );
}

function NothingSaved({ online, from }: { online: boolean; from: string }) {
  return (
    <div className="kin-offline" style={{ paddingTop: "3rem" }}>
      <Blueprint style={{ padding: "1.375rem 1.125rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.5rem" }}>
          <Icon name="info" size={18} style={{ color: "var(--color-accent-700)" }} />
          <h1 style={{ font: "600 1.25rem/1.2 var(--font-heading)", margin: 0 }}>{online ? "Back online" : "No connection"}</h1>
        </div>
        <p style={{ fontSize: "0.875rem", lineHeight: 1.5, color: "var(--color-neutral-800)", margin: "0 0 14px" }}>
          {online
            ? "Kin can reach the network again."
            : "Nothing is saved on this phone yet. Open Kin once while you have signal, signed in, and Today, the list, the Planner, chat and the emergency cards will be here next time."}
        </p>
        {online && (
          <a href={from} className="btn btn-primary" style={{ minHeight: "2.375rem", fontSize: "0.84375rem", padding: "0 0.875rem" }}>
            Open Kin
          </a>
        )}
      </Blueprint>
    </div>
  );
}

/** A line under each screen naming what needs the network, so a missing
 * button reads as a decision rather than a fault. */
function NeedsConnection({ children }: { children: React.ReactNode }) {
  return (
    <p className="kin-offline-note" style={{ marginTop: "1rem" }}>
      <Icon name="wifi" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
      {children}
    </p>
  );
}

function Waiting() {
  return <span className="kin-offline-pill">waiting to sync</span>;
}

function TodayView({ snap, queue, onMark }: { snap: OfflineSnapshot; queue: Queued[]; onMark: (op: QueuedOp) => void }) {
  const queued = new Set(queue.filter((q) => q.kind === "today.mark").map((q) => (q as Extract<QueuedOp, { kind: "today.mark" }>).key));
  return (
    <>
      <h2 className="kin-offline-h">Today</h2>
      {snap.today.length === 0 && <p className="kin-offline-empty">Nothing was due today when this was saved.</p>}
      {snap.today.map((item) => {
        const pending = queued.has(item.key);
        const mark = pending ? "done" : item.mark;
        return (
          <Blueprint key={item.key} style={{ padding: "0.8125rem", marginBottom: "0.5625rem", opacity: mark ? 0.78 : 1 }}>
            <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "600 0.96875rem/1.2 var(--font-heading)", textDecoration: mark ? "line-through" : undefined }}>{item.title}</span>
                <span style={{ display: "block", fontSize: "0.78125rem", color: item.urgent && !mark ? "var(--cal-money)" : "var(--color-neutral-600)", marginTop: "0.125rem" }}>
                  {item.meta}
                </span>
              </span>
              {pending ? (
                <Waiting />
              ) : mark ? (
                <span className="kin-offline-pill is-done">{mark === "done" ? "Done" : "Skipped"}</span>
              ) : item.markable ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem" }}
                  onClick={() => onMark({ id: newId(), at: new Date().toISOString(), kind: "today.mark", key: item.key, day: snap.day, date: item.date, label: item.title })}
                >
                  <Icon name="check" size={14} /> Done
                </button>
              ) : null}
            </div>
          </Blueprint>
        );
      })}
      <NeedsConnection>Offline, Done is saved on this phone and sent when you&rsquo;re back. Skip, Undo and paying a bill need a connection.</NeedsConnection>
    </>
  );
}

function ListView({ groups, queue, onChange }: { groups: NonNullable<OfflineSnapshot["shopping"]>; queue: Queued[]; onChange: (op: QueuedOp) => void }) {
  const [name, setName] = useState("");
  const toggles = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const q of queue) if (q.kind === "buy.toggle") m.set(q.itemId, q.checked);
    return m;
  }, [queue]);
  const added = queue.filter((q): q is Queued & Extract<QueuedOp, { kind: "buy.add" }> => q.kind === "buy.add");
  const open = groups.reduce((n, g) => n + g.items.filter((i) => !(toggles.get(i.id) ?? i.checked)).length, 0) + added.length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim().slice(0, 150);
    if (!trimmed) return;
    onChange({ id: newId(), at: new Date().toISOString(), kind: "buy.add", name: trimmed, label: trimmed });
    setName("");
  };

  return (
    <>
      <h2 className="kin-offline-h">
        To buy <span className="kin-offline-count">{open} left</span>
      </h2>
      <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.875rem" }}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an item"
          aria-label="Add an item"
          enterKeyHint="done"
          maxLength={150}
          style={{ flex: 1, minWidth: 0, fontSize: 16 }}
        />
        <button type="submit" className="btn btn-primary" disabled={!name.trim()} style={{ minHeight: "2.5rem", padding: "0 0.875rem" }}>
          Add
        </button>
      </form>

      {added.length > 0 && (
        <Blueprint style={{ padding: "0.5rem 0.8125rem", marginBottom: "0.625rem" }}>
          <div className="kin-offline-section">Added offline</div>
          {added.map((a) => (
            <div key={a.id} className="kin-offline-row">
              <span className="kin-offline-box" aria-hidden />
              <span style={{ flex: 1 }}>{a.name}</span>
              <Waiting />
            </div>
          ))}
        </Blueprint>
      )}

      {groups.map((g) => (
        <Blueprint key={g.name} style={{ padding: "0.5rem 0.8125rem", marginBottom: "0.625rem" }}>
          <div className="kin-offline-section">{g.name}</div>
          {g.items.map((item) => {
            const pending = toggles.has(item.id) && toggles.get(item.id) !== item.checked;
            const checked = toggles.get(item.id) ?? item.checked;
            return (
              <label key={item.id} className="kin-offline-row" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange({ id: newId(), at: new Date().toISOString(), kind: "buy.toggle", itemId: item.id, checked: !checked, label: item.name })}
                />
                <span style={{ flex: 1, textDecoration: checked ? "line-through" : undefined, color: checked ? "var(--color-neutral-600)" : undefined }}>
                  {item.name}
                  {item.quantity != null && (
                    <span style={{ color: "var(--color-neutral-600)" }}>
                      {" "}
                      · {item.quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  )}
                </span>
                {pending && <Waiting />}
              </label>
            );
          })}
        </Blueprint>
      ))}
      <NeedsConnection>Ticks and new items are saved on this phone and sent when you&rsquo;re back. Editing, removing, prices and building a list from meals need a connection.</NeedsConnection>
    </>
  );
}

function PlannerView({ snap }: { snap: OfflineSnapshot }) {
  return (
    <>
      <h2 className="kin-offline-h">This week</h2>
      {snap.planner.map((day) => {
        const d = new Date(`${day.date}T00:00:00`);
        return (
          <div key={day.date} style={{ marginBottom: "0.75rem" }}>
            <div className="kin-offline-section" style={{ color: day.isToday ? "var(--color-accent-700)" : undefined }}>
              {day.isToday ? "Today · " : ""}
              {d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
            </div>
            {day.items.length === 0 ? (
              <p className="kin-offline-empty" style={{ margin: "0.25rem 0 0" }}>
                Nothing planned
              </p>
            ) : (
              <Blueprint style={{ padding: "0.25rem 0.8125rem" }}>
                {day.items.map((it) => (
                  <div key={it.id} className="kin-offline-row" style={{ alignItems: "flex-start" }}>
                    <span style={{ width: "4.25rem", flex: "none", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{it.time ?? "All day"}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block" }}>{it.title}</span>
                      {(it.who || it.location) && (
                        <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{[it.who, it.location].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  </div>
                ))}
              </Blueprint>
            )}
          </div>
        );
      })}
      <NeedsConnection>Adding or changing plans needs a connection.</NeedsConnection>
    </>
  );
}

function ChatView({ snap, queue, online, onSend }: { snap: OfflineSnapshot; queue: Queued[]; online: boolean; onSend: (op: QueuedOp) => void }) {
  const [key, setKey] = useState(snap.conversations[0]?.key ?? "household");
  const [draft, setDraft] = useState("");
  const convo = snap.conversations.find((c) => c.key === key) ?? snap.conversations[0];
  const sending = convo?.canSend ? queue.filter((q): q is Queued & Extract<QueuedOp, { kind: "chat.send" }> => q.kind === "chat.send") : [];

  if (!convo) return <p className="kin-offline-empty">No conversations were saved.</p>;

  const send = (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim().slice(0, 4000);
    if (!body) return;
    onSend({ id: newId(), at: new Date().toISOString(), kind: "chat.send", body, label: "A message" });
    setDraft("");
  };

  return (
    <>
      {snap.conversations.length > 1 && (
        <div className="kin-offline-chips">
          {snap.conversations.map((c) => (
            <button key={c.key} type="button" aria-pressed={c.key === convo.key} onClick={() => setKey(c.key)}>
              {c.title}
            </button>
          ))}
        </div>
      )}
      <div className="kin-offline-thread">
        {convo.messages.length === 0 && <p className="kin-offline-empty">Nothing said here yet.</p>}
        {convo.messages.map((m) => (
          <Bubble key={m.id} mine={m.mine} author={m.author} body={m.body} at={m.at} />
        ))}
        {sending.map((m) => (
          <Bubble key={m.id} mine author="You" body={m.body} at={m.at} status={online ? "Sending…" : "Sending when you're back online"} />
        ))}
      </div>
      {convo.canSend ? (
        <form onSubmit={send} style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <textarea
            className="input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message"
            aria-label="Message"
            enterKeyHint="send"
            style={{ flex: 1, minWidth: 0, fontSize: 16, resize: "none", height: "2.5rem", minHeight: "2.5rem" }}
          />
          <button type="submit" className="btn btn-primary" disabled={!draft.trim()} style={{ minHeight: "2.5rem", padding: "0 0.875rem" }}>
            Send
          </button>
        </form>
      ) : (
        <NeedsConnection>Replying here needs a connection. Offline, only the household chat takes messages.</NeedsConnection>
      )}
      {convo.canSend && <NeedsConnection>Photos, voice notes, reactions and calls need a connection.</NeedsConnection>}
    </>
  );
}

function Bubble({ mine, author, body, at, status }: { mine: boolean; author: string; body: string; at: string; status?: string }) {
  const time = new Date(at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  return (
    <div className={`kin-offline-bubble${mine ? " is-mine" : ""}${status ? " is-sending" : ""}`}>
      {!mine && <div className="kin-offline-author">{author}</div>}
      <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{body}</div>
      <div className="kin-offline-time">{status ?? time}</div>
    </div>
  );
}

function SosView({ cards }: { cards: NonNullable<OfflineSnapshot["emergency"]> }) {
  return (
    <>
      <h2 className="kin-offline-h">Emergency cards</h2>
      {cards.map((c) => (
        <div key={c.memberId} className="kin-sos" style={{ marginBottom: "0.875rem" }}>
          <div className="kin-sos-head">
            <span className="kin-sos-badge">EMERGENCY</span>
          </div>
          <div style={{ font: "700 1.25rem/1.2 var(--font-heading)", margin: "0.375rem 0 0.5rem" }}>
            {c.name}
            {c.born && <span style={{ fontWeight: 400, fontSize: "0.875rem", color: "var(--color-neutral-600)" }}> · born {c.born}</span>}
          </div>
          <dl style={{ margin: 0 }}>
            {c.facts.map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: "0.75rem", padding: "0.3125rem 0", borderTop: "1px solid var(--color-neutral-200)" }}>
                <dt style={{ width: "7rem", flex: "none", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{k}</dt>
                <dd style={{ margin: 0, flex: 1, fontSize: "0.9375rem" }}>{v ?? "not recorded"}</dd>
              </div>
            ))}
          </dl>
          {c.calls.length > 0 && (
            <div style={{ marginTop: "0.625rem", display: "grid", gap: "0.375rem" }}>
              {c.calls.map((p) => (
                // A phone call needs signal, not Kin: tel: links work offline.
                <a key={`${p.name}-${p.phone}`} href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="btn btn-secondary" style={{ justifyContent: "flex-start", minHeight: "2.5rem" }}>
                  <Icon name="phone" size={15} /> {p.name}
                  {p.relationship ? ` · ${p.relationship}` : ""} · {p.phone}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
      <NeedsConnection>Changing a card needs a connection. Calls go through the phone, not Kin.</NeedsConnection>
    </>
  );
}
