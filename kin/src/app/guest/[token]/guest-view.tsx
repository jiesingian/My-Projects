"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { capLine } from "@/lib/gift-draw";
import { GUEST_DISHES_MAX, GUEST_HEADCOUNT_MAX, GUEST_NAME_KEY, GUEST_NAME_MAX, cleanGuestName, isGuestState, type GuestState } from "@/lib/event-guests";
import { parsePotluckItem } from "@/lib/potluck";
import { RSVP_ANSWERS, type RsvpAnswer } from "@/lib/event-rsvp";
import { readableDay } from "@/lib/time";

type GuestEvent = {
  title: string;
  when: string;
  hostName: string;
  open: boolean;
  coming: number;
  draw: { id: string; title: string; exchangeDate: string; priceCap: number | null; currency: string; drawn: boolean; open: boolean } | null;
};
type Item = { id: string; label: string; wanted: number; taken: number };

type Action =
  | { action: "hello" }
  | { action: "answer"; answer: RsvpAnswer | null; headcount: number }
  | { action: "claim"; item: string; qty: number }
  | { action: "dish"; label: string; wanted: number }
  | { action: "draw"; in: boolean };

// The name typed last time on this phone, per link: read as an external
// store (the way highlights.tsx reads what was seen), so the server renders
// the name box and the phone fills it in without a flash of setState.
const NAME_EVENT = "kin-guest-name";
function subscribeName(onChange: () => void) {
  window.addEventListener(NAME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function keepName(key: string, name: string) {
  try {
    if (name) localStorage.setItem(key, name);
    else localStorage.removeItem(key);
  } catch {
    /* a private window: the name lasts this visit only */
  }
  window.dispatchEvent(new Event(NAME_EVENT));
}

/** The guest's side of a guest link: type a name once (kept on this phone,
 * per link), then Going / Maybe / Can't go with how many, the potluck with
 * "I'll bring it" and a dish of your own, and the draw when the host
 * attached one. Everything goes through api/guest/[token] with the link as
 * the key; the page refreshes the shared numbers after each answer. */
export function GuestView({ token, event, potluck }: { token: string; event: GuestEvent; potluck: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const key = GUEST_NAME_KEY(token);
  const kept = useSyncExternalStore(
    subscribeName,
    () => {
      try {
        return localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
  // The name in use: what this visit set, else what the phone kept.
  const [chosen, setChosen] = useState<string | null>(null);
  const name = chosen ?? kept;
  const [draft, setDraft] = useState("");
  const greeted = useRef<string>("");
  const [state, setState] = useState<GuestState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heads, setHeads] = useState(1);
  const [dish, setDish] = useState("");
  const [showPick, setShowPick] = useState(false);

  const send = (body: Action, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/guest/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, name }),
        });
        const data = (await res.json().catch(() => ({}))) as { state?: unknown; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Kin couldn't save that just now. Try again in a minute.");
          if (res.status === 404) router.refresh();
          return;
        }
        if (isGuestState(data.state)) {
          setState(data.state);
          setHeads(data.state.headcount);
        } else setState(null);
        after?.();
        if (body.action !== "hello") router.refresh();
      } catch {
        setError("Kin couldn't reach the server. Check your connection and try again.");
      }
    });

  // Once a name is in use, ask once what this name has said already.
  useEffect(() => {
    if (name && greeted.current !== name) {
      greeted.current = name;
      send({ action: "hello" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per name
  }, [name]);

  const useName = (e: React.FormEvent) => {
    e.preventDefault();
    const n = cleanGuestName(draft);
    if (!n) {
      setError(`Write your name: up to ${GUEST_NAME_MAX} letters, nothing fancy.`);
      return;
    }
    setState(null);
    setChosen(n);
    keepName(key, n);
  };
  const changeName = () => {
    setDraft(name);
    setState(null);
    greeted.current = "";
    setChosen("");
    keepName(key, "");
  };

  const answer = state?.answer ?? null;
  const claims = state?.claims ?? {};
  const small: React.CSSProperties = { fontSize: "0.875rem", color: "var(--color-neutral-600)" };
  const h2: React.CSSProperties = { fontSize: "1.0625rem", margin: "1.5rem 0 0.5rem" };
  const chipRow: React.CSSProperties = { display: "flex", gap: "0.375rem", flexWrap: "wrap" };
  const d = event.draw;

  return (
    <div>
      <p className="kin-eyebrow" style={{ marginBottom: "0.25rem" }}>
        YOU&rsquo;RE INVITED
      </p>
      <h1 style={{ marginTop: 0 }}>{event.title}</h1>
      <p style={{ margin: "0 0 0.25rem" }}>{event.when}</p>
      <p style={{ ...small, margin: 0 }}>
        Hosted by {event.hostName}
        {event.coming > 0 ? ` · ${event.coming} coming` : ""}
        {!event.open ? " · this event is over" : ""}
      </p>

      {!name ? (
        <form onSubmit={useName} style={{ marginTop: "1.25rem" }}>
          <label htmlFor="guest-name" style={{ display: "block", fontWeight: 600, marginBottom: "0.375rem" }}>
            Your name
          </label>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            <input
              id="guest-name"
              className="input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={GUEST_NAME_MAX}
              autoComplete="name"
              placeholder="Tita Baby"
              style={{ flex: "1 1 12rem", minHeight: "2.75rem", minWidth: 0 }}
            />
            <button type="submit" className="btn btn-primary" style={{ minHeight: "2.75rem" }} disabled={pending}>
              That&rsquo;s me
            </button>
          </div>
          <p style={{ ...small, marginTop: "0.5rem" }}>Just your name, as the family knows you. No sign-up, no app.</p>
        </form>
      ) : (
        <p style={{ ...small, marginTop: "1rem" }}>
          Answering as <b style={{ color: "var(--color-text)" }}>{name}</b>.{" "}
          <button type="button" className="btn btn-ghost" style={{ minHeight: "1.75rem", padding: "0 0.5rem", fontSize: "0.8125rem" }} onClick={changeName}>
            Not you?
          </button>
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--color-danger, #b3261e)", fontSize: "0.875rem", margin: "0.75rem 0 0" }}>
          {error}
        </p>
      )}

      {name && (
        <>
          <h2 style={h2}>Are you coming?</h2>
          {event.open ? (
            <>
              <div role="group" aria-label="Are you coming?" style={chipRow}>
                {RSVP_ANSWERS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className="chip"
                    data-active={answer === a.key}
                    aria-pressed={answer === a.key}
                    disabled={pending}
                    onClick={() => send({ action: "answer", answer: answer === a.key ? null : a.key, headcount: heads })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {answer && answer !== "no" && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.9375rem" }}>How many of you?</span>
                  <button type="button" className="chip" aria-label="One fewer" disabled={pending || heads <= 1} onClick={() => send({ action: "answer", answer, headcount: heads - 1 })}>
                    −
                  </button>
                  <span style={{ minWidth: "1.5rem", textAlign: "center", fontWeight: 600 }}>{heads}</span>
                  <button type="button" className="chip" aria-label="One more" disabled={pending || heads >= GUEST_HEADCOUNT_MAX} onClick={() => send({ action: "answer", answer, headcount: heads + 1 })}>
                    +
                  </button>
                </div>
              )}
            </>
          ) : (
            <p style={small}>
              Answers are closed. {answer ? `You said ${answer === "going" ? "going" : answer === "maybe" ? "maybe" : "can't go"}.` : ""}
            </p>
          )}

          {(potluck.length > 0 || event.open) && (
            <>
              <h2 style={h2}>Who brings what</h2>
              {potluck.length === 0 && <p style={small}>Nothing is listed yet. Add what you&rsquo;ll bring below.</p>}
              {potluck.map((l) => {
                const qty = claims[l.id] ?? 0;
                const left = Math.max(0, l.wanted - l.taken);
                const limit = left + qty;
                return (
                  <div key={l.id} className="kin-potluck-row" data-covered={left === 0 || undefined}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.9375rem", fontWeight: 500 }}>
                        {l.label}
                        {l.wanted > 1 && <span style={{ color: "var(--color-neutral-600)", fontWeight: 400 }}> · {l.taken} of {l.wanted}</span>}
                      </div>
                      <div style={small}>{left === 0 ? (qty > 0 ? "You're bringing it" : "Covered") : qty > 0 ? `You're bringing ${qty}` : `${left} still needed`}</div>
                    </div>
                    {event.open && (qty > 0 || left > 0) && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        {qty > 0 && (
                          <button type="button" className="chip" aria-label={`Bring one fewer ${l.label}`} disabled={pending} onClick={() => send({ action: "claim", item: l.id, qty: qty - 1 })}>
                            −
                          </button>
                        )}
                        {qty > 0 && <span style={{ minWidth: "1.25rem", textAlign: "center", fontWeight: 600 }}>{qty}</span>}
                        {qty < limit && (
                          <button type="button" className="chip" data-active={qty > 0 || undefined} aria-label={qty > 0 ? `Bring one more ${l.label}` : `I'll bring ${l.label}`} disabled={pending} onClick={() => send({ action: "claim", item: l.id, qty: qty + 1 })}>
                            {qty > 0 ? "+" : "I'll bring it"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {event.open && (state?.dishes ?? 0) < GUEST_DISHES_MAX && (
                <form
                  style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem", flexWrap: "wrap" }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const parsed = parsePotluckItem(dish);
                    if (!parsed) return;
                    send({ action: "dish", label: parsed.label, wanted: parsed.wanted }, () => setDish(""));
                  }}
                >
                  <input className="input" aria-label="What you'll bring" placeholder="Something of your own, like “Leche flan x2”" value={dish} onChange={(e) => setDish(e.target.value)} maxLength={90} style={{ flex: "1 1 12rem", minHeight: "2.5rem", minWidth: 0 }} disabled={pending} />
                  <button type="submit" className="btn btn-secondary" style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }} disabled={pending || !dish.trim()}>
                    I&rsquo;ll bring this
                  </button>
                </form>
              )}
            </>
          )}

          {d && (
            <>
              <h2 style={h2}>{d.title}</h2>
              <p style={{ ...small, margin: "0 0 0.5rem" }}>
                Gift exchange on {d.exchangeDate ? readableDay(d.exchangeDate, { long: true }) : "the day"} · {capLine(d.priceCap, d.currency)}
              </p>
              {d.drawn ? (
                state?.in_draw && state.pick ? (
                  <div>
                    {showPick ? (
                      <div className="kin-potluck-row" style={{ display: "block" }}>
                        <div style={{ fontSize: "0.9375rem" }}>
                          You picked <b>{state.pick.name}</b>
                          {state.pick.household ? <span style={small}> · {state.pick.household}</span> : null}
                        </div>
                        {state.pick.wishes.length > 0 ? (
                          <ul style={{ margin: "0.375rem 0 0", paddingLeft: "1.125rem", fontSize: "0.875rem" }}>
                            {state.pick.wishes.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ ...small, marginTop: "0.25rem" }}>No wish list yet.</div>
                        )}
                      </div>
                    ) : (
                      <button type="button" className="btn btn-primary" style={{ minHeight: "2.5rem" }} onClick={() => setShowPick(true)}>
                        Show my pick
                      </button>
                    )}
                  </div>
                ) : (
                  <p style={small}>{state?.in_draw ? "The names are drawn; your pick is on its way." : "The names are drawn already."}</p>
                )
              ) : d.open ? (
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.9375rem" }}>
                  <input type="checkbox" checked={!!state?.in_draw} disabled={pending} onChange={(e) => send({ action: "draw", in: e.target.checked })} />
                  Put me in the draw
                </label>
              ) : (
                <p style={small}>The exchange day has passed.</p>
              )}
            </>
          )}
        </>
      )}

      <p style={{ ...small, marginTop: "2rem" }}>
        You see this event&rsquo;s name, date and list, nothing else of the family. Your name and answers are shown to the household as &ldquo;{name || "your name"} (by link)&rdquo;.
      </p>
    </div>
  );
}
