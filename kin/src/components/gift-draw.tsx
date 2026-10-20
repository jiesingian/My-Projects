"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icons";
import {
  removeDrawPersonAction,
  createGiftDrawAction,
  deleteGiftDrawAction,
  runGiftDrawAction,
  saveWishesAction,
  setDrawHouseholdAction,
  setDrawRulesAction,
  setInDrawAction,
} from "@/lib/actions/gift-draw";
import { WISHES_MAX } from "@/lib/gift-draw";

type Result = { error: string | null };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else after?.();
      router.refresh();
    });
  return { pending, run };
}

/** Start a draw: a name, a price cap, the day, and the two rules. */
export function NewDrawForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ title: "Monito-monita", cap: "500", exchangeDate: defaultDate, notOwnHousehold: true, revealOnDay: true });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createGiftDrawAction(f);
          if (r.error) toast.error(r.error);
          else if (r.id) router.push(`/planner/monito/${r.id}`);
        });
      }}
    >
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="draw-title">Name</label>
        <input id="draw-title" className="input" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={pending} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="draw-cap">Price cap</label>
          <input id="draw-cap" className="input" inputMode="decimal" placeholder="500" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} disabled={pending} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="draw-date">Exchange day</label>
          <input id="draw-date" className="input" type="date" value={f.exchangeDate} onChange={(e) => setF({ ...f, exchangeDate: e.target.value })} disabled={pending} />
        </div>
      </div>
      <label className="kin-draw-check">
        <input type="checkbox" checked={f.notOwnHousehold} onChange={(e) => setF({ ...f, notOwnHousehold: e.target.checked })} disabled={pending} />
        Nobody picks someone from their own household
      </label>
      <label className="kin-draw-check">
        <input type="checkbox" checked={f.revealOnDay} onChange={(e) => setF({ ...f, revealOnDay: e.target.checked })} disabled={pending} />
        On the day, show everyone who picked whom
      </label>
      <button type="submit" className="btn btn-primary btn-block" style={{ minHeight: "2.75rem", marginTop: "0.5rem" }} disabled={pending}>
        {pending ? "Starting…" : "Start the draw"}
      </button>
    </form>
  );
}

/** Who's in, and the household's own controls: put people in, ask linked
 * households, the rules, Draw. */
export function DrawSetup({
  drawId,
  drawn,
  mine,
  grownUp,
  notOwnHousehold,
  revealOnDay,
  people,
  households,
  canPutIn,
  canAsk,
  myFamilyId,
  meId,
  problem,
}: {
  drawId: string;
  drawn: boolean;
  mine: boolean;
  grownUp: boolean;
  notOwnHousehold: boolean;
  revealOnDay: boolean;
  people: { id: string; memberId: string | null; familyId: string; name: string; householdName: string; guest?: boolean }[];
  households: { familyId: string; name: string }[];
  canPutIn: { id: string; name: string }[];
  canAsk: { id: string; name: string }[];
  myFamilyId: string;
  meId: string;
  /** Why it can't be drawn yet, or null. */
  problem: string | null;
}) {
  const router = useRouter();
  const { pending, run } = useRun();
  const groups = new Map<string, typeof people>();
  for (const p of people) groups.set(p.householdName || "Household", [...(groups.get(p.householdName || "Household") ?? []), p]);
  const first = (n: string) => n.split(" ")[0];
  const organizerGrownUp = mine && grownUp;

  return (
    <div>
      {[...groups.entries()].map(([household, list]) => (
        <div key={household} style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{household}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.25rem" }}>
            {list.map((p) => (
              <span key={p.id} className="chip" data-active>
                {p.guest ? p.name : first(p.name)}
                {!drawn && p.familyId === myFamilyId && (grownUp || (p.memberId !== null && p.memberId === meId)) && (
                  <button
                    type="button"
                    className="kin-draw-x"
                    aria-label={`Take ${p.name} out`}
                    disabled={pending}
                    // A guest by link (20261020231000) has no member row: taken out by their place in the draw.
                    onClick={() => run(() => (p.memberId ? setInDrawAction(drawId, p.memberId, false) : removeDrawPersonAction(drawId, p.id)))}
                  >
                    <Icon name="x" size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}

      {!drawn && canPutIn.length > 0 && (
        <div style={{ marginTop: "0.625rem" }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.25rem" }}>Put in from your household</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {canPutIn.map((m) => (
              <button key={m.id} type="button" className="chip" disabled={pending} onClick={() => run(() => setInDrawAction(drawId, m.id, true))}>
                + {first(m.name)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!drawn && organizerGrownUp && (canAsk.length > 0 || households.length > 0) && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.25rem" }}>Linked households</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {households.map((h) => (
              <button key={h.familyId} type="button" className="chip" data-active aria-pressed="true" disabled={pending} onClick={() => run(() => setDrawHouseholdAction(drawId, h.familyId, false))}>
                {h.name} ✓
              </button>
            ))}
            {canAsk.map((h) => (
              <button key={h.id} type="button" className="chip" aria-pressed="false" disabled={pending} onClick={() => run(() => setDrawHouseholdAction(drawId, h.id, true))}>
                + {h.name}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0" }}>Each household asked puts its own people in.</p>
        </div>
      )}

      {!drawn && !mine && grownUp && (
        <button type="button" className="btn btn-secondary" style={{ marginTop: "0.75rem", minHeight: "2.375rem", fontSize: "0.84375rem" }} disabled={pending} onClick={() => run(() => setDrawHouseholdAction(drawId, myFamilyId, false), () => router.push("/planner/monito"))}>
          Leave this draw
        </button>
      )}

      {organizerGrownUp && (
        <div style={{ marginTop: "0.875rem" }}>
          {!drawn && (
            <>
              <label className="kin-draw-check">
                <input type="checkbox" checked={notOwnHousehold} disabled={pending} onChange={(e) => run(() => setDrawRulesAction(drawId, { notOwnHousehold: e.target.checked }))} />
                Nobody picks someone from their own household
              </label>
            </>
          )}
          <label className="kin-draw-check">
            <input type="checkbox" checked={revealOnDay} disabled={pending} onChange={(e) => run(() => setDrawRulesAction(drawId, { revealOnDay: e.target.checked }))} />
            On the day, show everyone who picked whom
          </label>
          {problem && <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.375rem 0" }}>{problem}</p>}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className={drawn ? "btn btn-secondary" : "btn btn-primary"}
              style={{ flex: 1, minHeight: "2.75rem" }}
              disabled={pending || !!problem}
              onClick={() => {
                if (drawn && !window.confirm("Draw again? Everyone's pick changes, and anyone who has looked will need to look again.")) return;
                run(() => runGiftDrawAction(drawId), () => toast.success(drawn ? "Drawn again. Everyone sees their new pick." : "Drawn! Everyone sees only who they picked."));
              }}
            >
              {drawn ? "Draw again" : "Draw names"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: "2.75rem" }}
              disabled={pending}
              onClick={() => {
                if (window.confirm("Call off this draw? Everyone's pick and wish list goes with it.")) run(() => deleteGiftDrawAction(drawId), () => router.push("/planner/monito"));
              }}
            >
              Call it off
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Who you picked, hidden until tapped, with their wish list. */
export function MyPick({ giverName, receiverName, receiverHousehold, wishes, own }: { giverName: string; receiverName: string; receiverHousehold: string; wishes: string[]; own: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="kin-draw-pick">
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{own ? "You picked" : `${giverName.split(" ")[0]} picked`}</div>
      {shown ? (
        <>
          <div style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0.125rem 0" }}>{receiverName}</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{receiverHousehold}</div>
          <div style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
            {wishes.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "1.125rem" }}>
                {wishes.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : (
              <span style={{ color: "var(--color-neutral-600)" }}>No wish list yet.</span>
            )}
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-primary" style={{ marginTop: "0.375rem", minHeight: "2.5rem" }} onClick={() => setShown(true)}>
          Show {own ? "my" : "their"} pick
        </button>
      )}
    </div>
  );
}

/** A wish list: one wish a line. Only whoever drew this person sees it. */
export function WishListEditor({ drawId, personId, name, wishes, own }: { drawId: string; personId: string; name: string; wishes: string[]; own: boolean }) {
  const { pending, run } = useRun();
  const [text, setText] = useState(wishes.join("\n"));
  const [saved, setSaved] = useState(true);
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <label htmlFor={`wish-${personId}`} style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
        {own ? "Your wish list" : `${name.split(" ")[0]}'s wish list`} · one a line, up to {WISHES_MAX}; only whoever picked {own ? "you" : "them"} sees it
      </label>
      <textarea
        id={`wish-${personId}`}
        className="input"
        rows={3}
        value={text}
        placeholder={"Jollibee gift card\nA book, any mystery"}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        style={{ width: "100%", marginTop: "0.25rem" }}
        disabled={pending}
      />
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2.25rem", fontSize: "0.8125rem", marginTop: "0.25rem" }} disabled={pending || saved} onClick={() => run(() => saveWishesAction(drawId, personId, text), () => setSaved(true))}>
        {saved ? "Saved" : "Save the list"}
      </button>
    </div>
  );
}
