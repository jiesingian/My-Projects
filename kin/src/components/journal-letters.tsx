import { readableDay } from "@/lib/time";
import type { LetterDay, OpenCard, OpenWhenEnvelope, SealedEnvelope, TimeCapsule } from "@/lib/queries/time-capsules";
import { OpenWhenButton } from "@/components/open-when-button";
import { CardSign } from "@/components/card-sign";
import { LetterForm, type LetterRecipient } from "@/components/letter-form";
import { LetterRemove } from "@/components/letter-remove";

const first = (name: string) => name.split(" ")[0] || name;

/** "Ana", "Ana and Ben", "Ana, Ben and Mia". */
function names(list: string[]): string {
  const xs = [...new Set(list.filter(Boolean))];
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** The letters of one special day. Under the person's own entry for the day
 * (`underEntry`), or on their own under the day's name when they wrote none,
 * so the letters are still there and easy to find. Each letter is an
 * envelope that opens with a tap. */
export function LetterDayLetters({ day, meId, underEntry = false }: { day: LetterDay; meId: string; underEntry?: boolean }) {
  const forMe = day.recipientMemberId === meId;
  const name = day.occasion || "A special day";
  // An "open when" letter, opened on this day by its recipient.
  const moment = day.letters.length === 1 && !!day.letters[0].openWhen;
  return (
    <section id={`letters-${day.key}`} className="kin-letterday" data-under-entry={underEntry} aria-label={`Letters for ${forMe ? "you" : first(day.recipientName)} · ${name}`}>
      {!underEntry && (
        <>
          <span style={{ font: "400 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)" }}>
            {moment ? "Opened " : ""}
            {readableDay(day.opensOn, { year: true })}
          </span>
          <h3 style={{ font: "600 1.3125rem/1.1 var(--font-heading)", margin: "7px 0 4px" }}>
            {moment ? name : `${forMe ? "Your" : `${first(day.recipientName)}'s`} ${name.charAt(0).toLowerCase() + name.slice(1)}`}
          </h3>
        </>
      )}
      <p className="kin-eyebrow" style={{ margin: underEntry ? "0.75rem 0 0.375rem" : "0.25rem 0 0.5rem" }}>
        {day.letters.length === 1
          ? `A letter ${forMe ? "for you" : `for ${first(day.recipientName)}`}`
          : `A card from ${names(day.letters.map((l) => first(l.writerName)))}`}
        {underEntry && day.occasion ? ` · ${day.occasion}` : ""}
      </p>
      {day.letters.map((l) => (
        <Letter key={l.id} letter={l} meId={meId} />
      ))}
    </section>
  );
}

function Letter({ letter: l, meId }: { letter: TimeCapsule; meId: string }) {
  const mineToSend = l.writerMemberId === meId && l.recipientMemberId !== meId;
  return (
    <details className="kin-letter" id={`letter-${l.id}`}>
      <summary>
        <span className="kin-letter-seal" aria-hidden="true" />
        <span>
          <strong>{mineToSend ? `Your letter to ${first(l.recipientName)}` : `From ${first(l.writerName) || "someone in your family"}`}</strong>
          <span className="kin-letter-meta">Written {readableDay(l.createdAt.slice(0, 10), { year: true })}</span>
        </span>
        <span className="kin-letter-open" aria-hidden="true">Open</span>
      </summary>
      <div className="kin-letter-paper">
        {l.title && <h4>{l.title}</h4>}
        <p>{l.body}</p>
        <p className="kin-letter-sign">— {first(l.writerName) || "Your family"}</p>
      </div>
    </details>
  );
}

/** Envelopes waiting for the reader: who from, the day, the occasion. */
export function SealedEnvelopes({ envelopes: all, openWhen = [] }: { envelopes: SealedEnvelope[]; openWhen?: OpenWhenEnvelope[] }) {
  if (all.length === 0 && openWhen.length === 0) return null;
  // Several notes for the same day are one card.
  const byDay = new Map<string, { id: string; writers: string[]; opensOn: string; occasion: string }>();
  for (const e of all) {
    const g = byDay.get(e.opensOn) ?? { id: e.id, writers: [], opensOn: e.opensOn, occasion: "" };
    g.writers.push(first(e.writerName));
    if (!g.occasion && e.occasion) g.occasion = e.occasion;
    byDay.set(e.opensOn, g);
  }
  const envelopes = [...byDay.values()];
  return (
    <section className="kin-envelopes" aria-label="Letters waiting for you">
      <p className="kin-eyebrow" style={{ margin: "0 0 0.375rem" }}>Sealed for you</p>
      <ul>
        {openWhen.map((e) => (
          <li key={e.id} className="kin-card-row">
            <span className="kin-letter-seal" aria-hidden="true" />
            <span style={{ flex: 1 }}>
              Open when {e.openWhen}
              <span className="kin-letter-meta">From {first(e.writerName) || "someone in your family"} · whenever the moment comes</span>
            </span>
            <OpenWhenButton id={e.id} moment={e.openWhen} />
          </li>
        ))}
        {envelopes.map((e) => (
          <li key={e.id}>
            <span className="kin-letter-seal" aria-hidden="true" />
            <span>
              {e.writers.length > 1 ? `A card from ${names(e.writers)}` : `From ${e.writers[0] || "someone in your family"}`}
              {e.occasion ? ` · ${e.occasion}` : ""}
              <span className="kin-letter-meta">Opens {readableDay(e.opensOn, { year: true })}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A grown-up's way in: write a letter for someone's special day, and the
 * letters they have sealed, which they may take back before they open. */
export function LetterCompose({ recipients, today, sealedByMe }: { recipients: LetterRecipient[]; today: string; sealedByMe: TimeCapsule[] }) {
  return (
    <details className="kin-letter-compose">
      <summary>
        <span className="kin-letter-seal" aria-hidden="true" />
        <span>
          Write a letter or start a card for a special day
          {sealedByMe.length > 0 && <span className="kin-letter-meta">{sealedByMe.length} sealed by you</span>}
        </span>
      </summary>
      <div style={{ padding: "0.75rem 0 0.25rem" }}>
        <LetterForm recipients={recipients} today={today} />
        {sealedByMe.length > 0 && (
          <ul className="kin-letter-sealed-list" aria-label="Sealed by you — only you can see these">
            {sealedByMe.map((l) => (
              <li key={l.id}>
                <span>
                  <strong>{l.title || `For ${first(l.recipientName)}`}</strong>
                  <span className="kin-letter-meta">
                    For {first(l.recipientName)}
                    {l.openWhen ? ` · ${l.occasion} · not opened yet` : <>{l.occasion ? ` · ${l.occasion}` : ""} · opens {readableDay(l.opensOn, { year: true })}</>}
                    {l.openToSign ? "" : " · private"}
                  </span>
                </span>
                <LetterRemove id={l.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/** Cards being signed in the household: whose day, when, who has signed --
 * and a way to add your own note. Never shown to the person it's for. */
export function OpenCards({ cards }: { cards: OpenCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="kin-envelopes" aria-label="Cards to sign">
      <p className="kin-eyebrow" style={{ margin: "0 0 0.375rem" }}>Cards to sign</p>
      <ul>
        {cards.map((c) => {
          const who = first(c.recipientName);
          const what = c.occasion ? c.occasion.charAt(0).toLowerCase() + c.occasion.slice(1) : "special day";
          return (
            <li key={`${c.recipientMemberId}-${c.opensOn}`} className="kin-card-row">
              <span className="kin-letter-seal" aria-hidden="true" />
              <span style={{ flex: 1 }}>
                {who}&apos;s {what}
                <span className="kin-letter-meta">
                  Opens {readableDay(c.opensOn, { year: true })} · signed by {names(c.signers)}
                </span>
              </span>
              {c.signedByMe ? (
                <span className="kin-letter-meta" style={{ fontWeight: 600 }}>✓ Signed</span>
              ) : (
                <CardSign recipientId={c.recipientMemberId} recipientFirst={who} opensOn={c.opensOn} occasion={c.occasion} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
