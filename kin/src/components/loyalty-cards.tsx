"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatedSheet } from "@/components/animated-sheet";
import { Icon } from "@/components/icons";
import { qrModules, qrPath } from "@/lib/qr";
import { cardsForCheckout, scanValue, type LoyaltyCard } from "@/lib/loyalty-cards";
import { saveLoyaltyCardAction, removeLoyaltyCardAction } from "@/lib/actions/household";

/** Stores a household here is likely to have a card for, offered as the
 * store is typed. Anything else can be typed too. */
const STORES = [
  "SM Supermarket",
  "Puregold",
  "Robinsons Supermarket",
  "S&R",
  "Landers",
  "Shopwise",
  "Waltermart",
  "Mercury Drug",
  "Watsons",
  "Rose Pharmacy",
  "Palengke",
];

const QR_MARGIN = 4;

/** The number as a QR code, black on white whatever the theme: that is what
 * a scanner reads best off a phone screen. */
function CardQr({ value, size }: { value: string; size: string }) {
  const modules = useMemo(() => qrModules(value), [value]);
  const n = modules.length + QR_MARGIN * 2;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label="QR code of the card number" shapeRendering="crispEdges" style={{ display: "block" }}>
      <rect width={n} height={n} fill="#fff" />
      <path d={qrPath(modules, QR_MARGIN)} fill="#000" />
    </svg>
  );
}

/** One card, as big and plain as a cashier needs it: white, black, the
 * number large, the code larger. Over everything else, screen kept awake. */
function CardFullScreen({ card, onClose }: { card: LoyaltyCard; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // A phone dims itself while the cashier fumbles for the scanner. Where
    // the browser allows it, keep the screen on while the card is up.
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => {
        if (gone) void l.release();
        else lock = l;
      })
      .catch(() => {});
    return () => {
      gone = true;
      window.removeEventListener("keydown", onKey);
      void lock?.release().catch(() => {});
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "#fff",
        color: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "calc(env(safe-area-inset-top, 0) + 1rem) 1rem calc(env(safe-area-inset-bottom, 0) + 1rem)",
        textAlign: "center",
        pointerEvents: "auto",
      }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close the card"
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0) + 0.75rem)",
          right: "0.75rem",
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "2px solid #000",
          background: "#fff",
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="x" size={20} />
      </button>

      <div>
        <div id={titleId} style={{ font: "700 1.5rem/1.2 var(--font-heading)" }}>
          {card.store}
        </div>
        {card.card_name && <div style={{ fontSize: "1rem", marginTop: "0.25rem" }}>{card.card_name}</div>}
      </div>

      {card.code_format === "qr" && <CardQr value={scanValue(card.card_number)} size="min(78vw, 52vh)" />}

      <div
        style={{
          font: "700 clamp(1.5rem, 8vw, 2.5rem)/1.15 ui-monospace, SFMono-Regular, Menlo, monospace",
          letterSpacing: "0.08em",
          wordBreak: "break-all",
          userSelect: "all",
        }}
      >
        {card.card_number}
      </div>

      {card.note && <div style={{ fontSize: "1.0625rem", maxWidth: 420 }}>{card.note}</div>}
      <div style={{ fontSize: "0.8125rem", color: "#444" }}>Turn your screen brightness up if the scanner misses it. Tap anywhere to close.</div>
    </div>,
    document.body,
  );
}

/** A card as a tile: the store, the number large enough to read out, and a
 * tap to put it full screen for the scanner. */
function CardTile({ card, onOpen }: { card: LoyaltyCard; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show the ${card.store} card full screen`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        width: "100%",
        textAlign: "left",
        padding: "0.75rem",
        borderRadius: 14,
        border: "1px solid var(--color-divider)",
        background: "var(--color-surface, transparent)",
        color: "var(--color-text)",
      }}
    >
      {card.code_format === "qr" ? (
        <span style={{ flex: "none", borderRadius: 6, overflow: "hidden" }}>
          <CardQr value={scanValue(card.card_number)} size="4.25rem" />
        </span>
      ) : (
        <span style={{ flex: "none", width: "4.25rem", height: "4.25rem", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--color-text) 6%, transparent)" }}>
          <Icon name="wallet" size={22} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", font: "600 0.9375rem/1.25 var(--font-heading)" }}>
          {card.store}
          {card.card_name && <span style={{ fontWeight: 400, color: "var(--color-neutral-700)" }}> · {card.card_name}</span>}
        </span>
        <span style={{ display: "block", font: "600 1.125rem/1.3 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "0.05em", marginTop: "0.125rem", wordBreak: "break-all" }}>
          {card.card_number}
        </span>
        {card.note && <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-700)", marginTop: "0.125rem" }}>{card.note}</span>}
      </span>
      <Icon name="maximize" size={16} style={{ flex: "none", color: "var(--color-neutral-600)" }} />
    </button>
  );
}

/** At the counter: the cards for the shopping day's store, or all of them,
 * on the Buy list itself while a shopping day is on or the basket is being
 * checked out. */
export function CheckoutCards({ cards, tripTitle }: { cards: LoyaltyCard[]; tripTitle: string | null }) {
  const [open, setOpen] = useState<LoyaltyCard | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const { shown, others, matched } = cardsForCheckout(cards, tripTitle);
  if (cards.length === 0) return null;

  return (
    <section aria-label="Cards for the counter" style={{ marginBottom: "0.875rem" }}>
      <div style={{ fontSize: "0.71875rem", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: "0.4375rem" }}>
        {matched ? `Your card${shown.length === 1 ? "" : "s"} for ${tripTitle}` : "Your cards at the counter"}
      </div>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {[...shown, ...(showOthers ? others : [])].map((c) => (
          <CardTile key={c.id} card={c} onOpen={() => setOpen(c)} />
        ))}
      </div>
      {others.length > 0 && !showOthers && (
        <button type="button" className="btn btn-ghost" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.375rem", marginTop: "0.25rem" }} onClick={() => setShowOthers(true)}>
          Show the other {others.length === 1 ? "card" : `${others.length} cards`}
        </button>
      )}
      {open && <CardFullScreen card={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function CardForm({ card, onDone }: { card: LoyaltyCard | null; onDone: () => void }) {
  const router = useRouter();
  const listId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState(card?.store ?? "");
  const [cardName, setCardName] = useState(card?.card_name ?? "");
  const [cardNumber, setCardNumber] = useState(card?.card_number ?? "");
  const [note, setNote] = useState(card?.note ?? "");
  const [showQr, setShowQr] = useState(card ? card.code_format === "qr" : true);
  const [removing, setRemoving] = useState(false);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        onDone();
        router.refresh();
      }
    });
  };

  const field = { minHeight: "2.5rem", fontSize: "0.875rem", marginBottom: "0.5rem" } as const;

  return (
    <div style={{ padding: "0.75rem", borderRadius: 14, background: "color-mix(in srgb, var(--color-text) 4%, transparent)", marginBottom: "0.75rem" }}>
      <input className="input" value={store} onChange={(e) => setStore(e.target.value)} list={listId} aria-label="Store" placeholder="Store — SM Supermarket, Puregold, the palengke…" maxLength={80} style={field} />
      <datalist id={listId}>
        {STORES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input className="input" value={cardName} onChange={(e) => setCardName(e.target.value)} aria-label="Card name" placeholder="Card name — SM Advantage, Suki card (optional)" maxLength={80} style={field} />
      <input
        className="input"
        value={cardNumber}
        onChange={(e) => setCardNumber(e.target.value)}
        aria-label="Card number"
        placeholder="Card number"
        maxLength={64}
        autoComplete="off"
        style={{ ...field, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      />
      <input className="input" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" placeholder="Note — ask for suki price, Mama's card (optional)" maxLength={200} style={field} />
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", marginBottom: "0.625rem" }}>
        <input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} />
        Show the number as a QR code for the scanner
      </label>

      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}
          disabled={pending || !store.trim() || !cardNumber.trim()}
          onClick={() => run(() => saveLoyaltyCardAction({ id: card?.id ?? null, store, cardName, cardNumber, showQr, note }))}
        >
          {pending ? "Saving…" : card ? "Save" : "Add the card"}
        </button>
        {card && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: "2.625rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
            disabled={pending}
            onClick={() => (removing ? run(() => removeLoyaltyCardAction(card.id)) : setRemoving(true))}
          >
            {removing ? "Yes, take it off" : "Take it off"}
          </button>
        )}
        <button type="button" className="btn btn-ghost" style={{ minHeight: "2.625rem", fontSize: "0.78125rem", padding: "0 0.5rem" }} onClick={onDone}>
          Cancel
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.5rem" }}>{error}</div>}
    </div>
  );
}

/** The household's cards, from the Buy list's shopping-day row: every card,
 * the shopping day's store first; grown-ups add and change them here. */
export function LoyaltyCardsButton({ cards, tripTitle, canEdit }: { cards: LoyaltyCard[]; tripTitle: string | null; canEdit: boolean }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LoyaltyCard | "new" | null>(null);
  const [showing, setShowing] = useState<LoyaltyCard | null>(null);
  const { shown, others } = cardsForCheckout(cards, tripTitle);
  const ordered = [...shown, ...others];

  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="btn btn-secondary"
        style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", gap: "0.3125rem" }}
      >
        <Icon name="wallet" size={15} />
        Cards{cards.length > 0 ? ` · ${cards.length}` : ""}
      </button>

      <AnimatedSheet open={open} onClose={close} labelledBy={titleId} panelClassName="sheet-panel--full" panelStyle={{ maxWidth: 520, height: "92vh" }}>
        <div style={{ padding: "0.625rem 1.125rem 0.5rem", flex: "none" }}>
          <div style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto 12px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span id={titleId} style={{ flex: 1, font: "600 1.1875rem/1.2 var(--font-heading)" }}>
              Suki &amp; loyalty cards
            </span>
            <button type="button" onClick={close} className="btn btn-secondary btn-icon" style={{ width: 32, height: 32 }} aria-label="Close">
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0.25rem 1.125rem calc(env(safe-area-inset-bottom, 0) + 1.25rem)" }}>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem", lineHeight: 1.45 }}>
            The household&rsquo;s cards, ready at the counter. On a shopping day the Buy list puts the store&rsquo;s card at the
            top; tap one to show it full screen for the cashier.
            {!canEdit && " A grown-up adds and changes them."}
          </p>

          {editing === "new" && <CardForm card={null} onDone={() => setEditing(null)} />}

          {cards.length === 0 && editing !== "new" && (
            <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", padding: "0.5rem 0 0.75rem" }}>No cards yet.</div>
          )}

          <div style={{ display: "grid", gap: "0.5rem" }}>
            {ordered.map((c) =>
              editing !== "new" && editing?.id === c.id ? (
                <CardForm key={c.id} card={c} onDone={() => setEditing(null)} />
              ) : (
                <div key={c.id}>
                  <CardTile
                    card={c}
                    onOpen={() => {
                      // The card goes over everything; the sheet steps aside
                      // so nothing of it sits under the scanner.
                      close();
                      setShowing(c);
                    }}
                  />
                  {canEdit && (
                    <button type="button" className="btn btn-ghost" style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.375rem" }} onClick={() => setEditing(c)}>
                      Change
                    </button>
                  )}
                </div>
              ),
            )}
          </div>

          {canEdit && editing !== "new" && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "100%", minHeight: "2.5rem", fontSize: "0.84375rem", gap: "0.375rem", marginTop: "0.75rem" }}
              onClick={() => setEditing("new")}
            >
              <Icon name="plus" size={15} />
              Add a card
            </button>
          )}
        </div>
      </AnimatedSheet>

      {showing && <CardFullScreen card={showing} onClose={() => setShowing(null)} />}
    </>
  );
}
