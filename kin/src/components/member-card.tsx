"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/avatar";
import { useCalls } from "@/components/call-provider";
import { initials, formatCurrency } from "@/lib/format";
import { apartLabel, clockIn, isNightIn, mapLink, sinceLabel, zoneCity, type CardAudience } from "@/lib/member-card";
import { askAreYouOkayAction, getMemberCardAction, type MemberCardData } from "@/lib/actions/member-card";
import styles from "./member-card.module.css";

type View = "self" | "grownup" | "child";

/** The inside of a person's card on Today (lib/member-card has the rules for
 * who sees what). Fetched when it opens. Your own card has a switch at the
 * top that shows it the way a grown-up, or a child, in the household sees it
 * -- built by the same code, with your "Just me" things taken out. */
export function MemberCardBody({ memberId, meId, glasses, titleId, onClose }: { memberId: string; meId: string; glasses: number | null; titleId: string; onClose: () => void }) {
  const isMe = memberId === meId;
  const [view, setView] = useState<View>("self");
  const [loaded, setLoaded] = useState<{ key: string; card: MemberCardData | null; error: string | null } | null>(null);
  const key = `${memberId}:${isMe ? view : "self"}`;

  useEffect(() => {
    let live = true;
    // A plain promise, not startTransition(async ...): the state set after
    // the await in a transition never reached the screen, and the card sat on
    // its skeleton (found on dev, 30 September).
    getMemberCardAction(memberId, isMe && view !== "self" ? view : undefined).then(
      (res) => live && setLoaded({ key, card: res.card, error: res.error }),
      () => live && setLoaded({ key, card: null, error: "The card couldn't load. Try again." }),
    );
    return () => {
      live = false;
    };
  }, [key, memberId, isMe, view]);

  // Keeps the last card on screen while the next view loads, rather than
  // flashing a skeleton between "You" and "As grown-ups see it".
  const card = loaded?.card && loaded.card.id === memberId ? loaded.card : null;

  return (
    <div className={styles.card}>
      {isMe && (
        <div className={styles.seg} role="group" aria-label="Whose view of your card">
          {(
            [
              ["self", "You"],
              ["grownup", "Grown-ups see"],
              ["child", "Children see"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!card ? (
        loaded?.error && loaded.key === key ? (
          <p id={titleId} className="confirm-title">
            {loaded.error}
          </p>
        ) : (
          <Skeleton titleId={titleId} />
        )
      ) : (
        <CardContent key={card.audience + String(card.preview)} card={card} glasses={glasses} titleId={titleId} isMe={isMe} onClose={onClose} />
      )}
    </div>
  );
}

function Skeleton({ titleId }: { titleId: string }) {
  return (
    <div className={styles.section} aria-busy="true">
      <span id={titleId} className="sr-only">
        Loading
      </span>
      <div className={styles.skeleton} style={{ width: "55%", height: "1.25rem" }} />
      <div className={styles.skeleton} style={{ width: "35%", height: "2rem" }} />
      <div className={styles.skeleton} style={{ width: "80%" }} />
      <div className={styles.skeleton} style={{ width: "70%" }} />
    </div>
  );
}

const WHO: Record<string, string> = {
  now: "Everyone at home",
  location: "Everyone, while you share it",
  today: "Everyone at home",
  money: "Grown-ups only",
  care: "Grown-ups, as Health allows",
};

function CardContent({ card, glasses, titleId, isMe, onClose }: { card: MemberCardData; glasses: number | null; titleId: string; isMe: boolean; onClose: () => void }) {
  const first = card.name.split(" ")[0];
  const showWho = isMe && !card.preview;
  const now = useNow();
  const myTz = useMyZone();

  return (
    <div className={`${styles.card} ${styles.fade}`}>
      <div className={styles.head}>
        <Avatar url={card.avatarUrl} initials={initials(card.name)} label={card.name} size={48} clickable={false} />
        <div>
          <p id={titleId} className={styles.name}>
            {card.name}
          </p>
          <p className={styles.sub}>{card.preview ? previewLine(card.audience) : isMe ? "Your card" : card.lastActiveAt ? `Last active ${sinceLabel(card.lastActiveAt, now ?? undefined)}` : "No recent activity"}</p>
        </div>
      </div>

      {/* Now: their time, where they are if they share it, the weather there. */}
      <section className={styles.section} aria-label="Now">
        <h3 className={styles.eyebrow}>
          Now {showWho && <span className={styles.who}>{WHO.now}</span>}
        </h3>
        {card.timezone && now ? (
          <div className={styles.clock}>
            <span className={styles.time} suppressHydrationWarning>
              {clockIn(card.timezone, now)}
            </span>
            <span className={styles.zone}>
              in {zoneCity(card.timezone)}
              {!isMe && myTz && card.timezone !== myTz && <> · {apartLabel(card.timezone, myTz, now)}</>}
              {!isMe && isNightIn(card.timezone, now) && <> · night there</>}
            </span>
          </div>
        ) : (
          <p className={`${styles.zone} ${styles.muted}`} style={{ margin: 0 }}>
            {card.timezone ? " " : isMe ? "Your time shows here once Kin has opened on your phone." : `${first}'s time shows once Kin opens on their phone.`}
          </p>
        )}
        <div className={styles.rows}>
          <div className={styles.row}>
            <Icon name="mapPin" size={16} />
            {card.location ? (
              <a href={mapLink(card.location.lat, card.location.lng)} target="_blank" rel="noopener noreferrer">
                On the map{card.location.updatedAt ? ` · ${sinceLabel(card.location.updatedAt, now ?? undefined)}` : ""}
              </a>
            ) : (
              <span className={styles.muted}>{card.sharingLocation ? "Sharing, no position yet" : "Location off"}</span>
            )}
            {showWho && (
              <Link href="/family?seg=quicklinks" className={styles.meta} onClick={onClose}>
                {card.sharingLocation ? "Sharing" : "Turn on"}
              </Link>
            )}
          </div>
          {card.weather && (
            <div className={styles.row}>
              <Icon name="sparkle" size={16} />
              <span>
                {card.weather.tempC}°C · {card.weather.label}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Today: their day and their goals. */}
      <section className={styles.section} aria-label="Today">
        <h3 className={styles.eyebrow}>
          Today {showWho && <span className={styles.who}>{WHO.today}</span>}
        </h3>
        {/* Water, as the old card on this strip showed it to everyone. */}
        {glasses !== null && glasses > 0 && (
          <div className={styles.row} style={{ fontSize: "0.90625rem" }}>
            <Icon name="glassWater" size={16} />
            <span>
              {glasses} glass{glasses === 1 ? "" : "es"} of water
            </span>
          </div>
        )}
        {card.day.length === 0 && card.goals.length === 0 ? (
          <p className={styles.muted} style={{ margin: 0, fontSize: "0.875rem" }}>
            Nothing planned today.
          </p>
        ) : (
          <div className={styles.rows}>
            {card.day.map((d) => (
              <div key={d.id} className={styles.row}>
                <Icon name={d.kind === "chore" ? "check" : d.kind === "event" ? "gift" : "calendarDays"} size={16} />
                <span className={d.done ? styles.done : undefined}>{d.title}</span>
                {d.at && card.timezone && <span className={styles.meta}>{clockIn(card.timezone, new Date(d.at))}</span>}
              </div>
            ))}
            {card.goals.map((g) => (
              <div key={g.id} className={styles.section} style={{ gap: "0.3125rem" }}>
                <div className={styles.row}>
                  <Icon name="target" size={16} />
                  <span>{g.title}</span>
                  <span className={styles.meta}>{g.reached ? "Reached" : g.noData ? "Not started" : `${Math.round(g.fraction * 100)}%`}</span>
                </div>
                {!g.noData && (
                  <div className={styles.bar} style={{ marginLeft: "1.625rem" }} aria-hidden="true">
                    <i style={{ width: `${Math.round(Math.min(1, Math.max(0, g.fraction)) * 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Money: grown-ups only, never a child, never kid view. */}
      {card.sections.money && card.money && (
        <section className={styles.section} aria-label="Money this month">
          <h3 className={styles.eyebrow}>
            Money this month {showWho && <span className={styles.who}>{WHO.money}</span>}
          </h3>
          {!card.money.hasAccounts ? (
            <p className={styles.muted} style={{ margin: 0, fontSize: "0.875rem" }}>
              {isMe && !card.preview ? "No accounts of your own in Wealth." : `No accounts of ${isMe ? "yours" : "their own"} to show.`}
            </p>
          ) : (
            <>
              <div className={styles.row}>
                <Icon name="wallet" size={16} />
                <span>
                  {formatCurrency(card.money.spent, card.money.currency)} spent
                  {card.money.budget !== null && <span className={styles.muted}> of {formatCurrency(card.money.budget, card.money.currency)}</span>}
                </span>
              </div>
              {card.money.budget !== null ? (
                <div className={styles.bar} data-over={card.money.spent > card.money.budget ? "" : undefined} aria-hidden="true">
                  <i style={{ width: `${Math.round(Math.min(1, card.money.spent / card.money.budget) * 100)}%` }} />
                </div>
              ) : (
                <p className={styles.muted} style={{ margin: 0, fontSize: "0.8125rem" }}>
                  {isMe && !card.preview ? "Set a monthly target in Wealth to measure against." : "Their monthly target is private to them."}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Care: medicines due today, only as far as Health already shares them. */}
      {card.sections.care && card.care && card.care.length > 0 && (
        <section className={styles.section} aria-label="Care">
          <h3 className={styles.eyebrow}>
            Medicines today {showWho && <span className={styles.who}>{WHO.care}</span>}
          </h3>
          <div className={styles.rows}>
            {card.care.map((d, i) => (
              <div key={`${d.name}-${d.time}-${i}`} className={styles.row}>
                <Icon name={d.taken ? "check" : "clock"} size={16} />
                <span className={d.taken ? styles.done : undefined}>
                  {d.name}
                  {d.dose ? ` · ${d.dose}` : ""}
                </span>
                <span className={`${styles.meta} ${d.late ? styles.late : ""}`}>{d.taken ? "Taken" : d.late ? `${d.time} · late` : d.time}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {card.sections.lastActive && card.lastMessageAt && (
        <p className={styles.muted} style={{ margin: 0, fontSize: "0.8125rem" }}>
          <Icon name="message" size={14} style={{ verticalAlign: "-2px", marginRight: "0.375rem" }} />
          Last message in the family chat {sinceLabel(card.lastMessageAt, now ?? undefined)}
        </p>
      )}

      {card.sections.actions && !card.preview && <Actions card={card} onClose={onClose} />}

      <div className="confirm-actions" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
          Close
        </button>
        <Link href={`/family/members/${card.id}`} className="btn btn-primary btn-block" onClick={onClose}>
          Open profile
        </Link>
      </div>
    </div>
  );
}

function previewLine(audience: CardAudience): string {
  return audience === "grownup" ? "What a grown-up at home sees" : "What a child at home sees";
}

function Actions({ card, onClose }: { card: MemberCardData; onClose: () => void }) {
  const calls = useCalls();
  const first = card.name.split(" ")[0];
  const inApp = calls?.members.find((m) => m.id === card.id)?.callable && !calls.busy;
  const [asked, setAsked] = useState<{ at: string; answer: string | null; answeredAt: string | null } | null>(
    card.checkIn ? { at: card.checkIn.askedAt, answer: card.checkIn.answer, answeredAt: card.checkIn.answeredAt } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const now = useNow();
  // An ask that is still waiting, and recent, is shown as waiting; an old
  // or answered one leaves the button free to ask again.
  const waiting = asked && !asked.answer && now !== null && now.getTime() - new Date(asked.at).getTime() < 15 * 60_000;

  // Plain async with a busy flag rather than startTransition: state set after
  // an awaited action inside a transition did not reach the screen here.
  const ask = async () => {
    setPending(true);
    setError(null);
    const res = await askAreYouOkayAction(card.id).catch(() => ({ error: "Couldn't ask just now. Try again." }));
    setPending(false);
    if (res.error) setError(res.error);
    else setAsked({ at: new Date().toISOString(), answer: null, answeredAt: null });
  };

  return (
    <section className={styles.section} aria-label={`Reach ${first}`}>
      <div className={styles.actions}>
        {inApp ? (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              onClose();
              calls!.start(card.id, false);
            }}
          >
            <Icon name="phone" size={18} />
            Call
          </button>
        ) : (
          card.mobile && (
            <a className={styles.action} href={`tel:${card.mobile.replace(/[^\d+]/g, "")}`}>
              <Icon name="phone" size={18} />
              Call
            </a>
          )
        )}
        {card.hasLogin && (
          <Link className={styles.action} href={card.messageHref} onClick={onClose}>
            <Icon name="message" size={18} />
            Message
          </Link>
        )}
        {card.hasLogin && (
          <button type="button" className={styles.action} onClick={ask} disabled={pending || !!waiting} data-state={waiting ? "asked" : undefined}>
            <Icon name={waiting ? "clock" : "shieldCheck"} size={18} />
            {waiting ? "Asked · waiting" : pending ? "Asking…" : "Are you okay?"}
          </button>
        )}
      </div>
      {asked?.answer && (
        <p className={styles.muted} style={{ margin: 0, fontSize: "0.8125rem" }} role="status">
          {asked.answer === "ok" ? `${first} said they're okay` : `${first} asked you to call`} {sinceLabel(asked.answeredAt, now ?? undefined)}.
        </p>
      )}
      {waiting && (
        <p className={styles.muted} style={{ margin: 0, fontSize: "0.8125rem" }} role="status">
          {first} has been asked. You&rsquo;ll get a notification when they answer.
        </p>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: "0.8125rem", color: "#d13438" }} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** The time now, ticking every 30 seconds; null until mounted, so the server
 * never prints its own clock into somebody else's day. */
function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useMyZone(): string | null {
  // Null on the server, the phone's own zone once hydrated.
  return useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    () => null,
  );
}

const noSubscribe = () => () => {};
