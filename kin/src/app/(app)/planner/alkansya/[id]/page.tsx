import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAlkansya, NEW_PLAN, type AlkansyaEntry } from "@/lib/queries/alkansya";
import { getMemberScores } from "@/lib/queries/routines";
import { DetailHeader } from "@/components/hub-header";
import { Blueprint } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";
import { ALKANSYA_DISCLAIMER, JARS, JAR_LABEL, KIND_LABEL, WEEKDAYS, interestOn, nextPayday } from "@/lib/alkansya";
import { AlkansyaControls, RemoveEntryButton } from "./alkansya-controls";

/** One child's alkansya: the three jars, when the next baon comes, and every
 * peso in and out. A grown-up keeps it from here; the child reads it -- their
 * own and nobody else's. */
export default async function ChildAlkansyaPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const grownUp = isGrownUp(me.role);
  if (!grownUp && id !== me.id) redirect(`/planner/alkansya/${me.id}`);

  const [alkansya, scores] = await Promise.all([getAlkansya(me.family_id, id), getMemberScores(me.family_id)]);
  if (!alkansya) notFound();
  const currency = me.families.currency;
  const first = alkansya.name.split(" ")[0];
  const plan = alkansya.plan;
  const today = familyDay(new Date(), me.families.time_zone || undefined);
  const next = plan?.active && plan.weeklyAmount > 0 ? nextPayday(addDay(today), plan.payWeekday) : null;
  const spendable = scores.find((s) => s.id === id)?.spendable ?? 0;

  return (
    <div>
      <DetailHeader backHref={grownUp ? "/planner/alkansya" : "/today"} eyebrow="Piggy bank" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 0.25rem" }}>{id === me.id ? "Your piggy bank" : `${first}’s piggy bank`}</h3>
        <div style={{ font: "600 min(2.375rem, 10vw)/1.05 var(--font-heading)", fontVariantNumeric: "tabular-nums", margin: "0.25rem 0 0.375rem" }}>
          {formatCurrency(alkansya.balances.total, currency)}
        </div>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginBottom: "0.875rem" }}>
          {next
            ? `Next allowance ${formatCurrency(plan!.weeklyAmount, currency)} on ${WEEKDAYS[plan!.payWeekday]}, ${new Date(`${next}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`
            : "No weekly allowance set"}
          {plan && plan.pesoPerPoint > 0 ? ` · 1 point = ${formatCurrency(plan.pesoPerPoint, currency)}` : ""}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem", marginBottom: "0.875rem" }}>
          {JARS.map((j) => (
            <Blueprint key={j} style={{ padding: "0.6875rem 0.625rem" }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>{JAR_LABEL[j].name}</div>
              <div style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>{JAR_LABEL[j].line}</div>
              <div style={{ fontFamily: "var(--font-numeric)", fontWeight: 600, fontSize: "1rem", marginTop: "0.25rem", overflowWrap: "anywhere" }}>
                {formatCurrency(alkansya.balances[j], currency)}
              </div>
            </Blueprint>
          ))}
        </div>

        <p role="note" style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", lineHeight: 1.45, margin: "0 0 1rem" }}>
          {ALKANSYA_DISCLAIMER}
        </p>

        {grownUp && (
          <AlkansyaControls
            memberId={id}
            plan={plan ?? NEW_PLAN}
            isNew={!plan}
            balances={alkansya.balances}
            spendablePoints={spendable}
            interestNow={plan ? interestOn(alkansya.balances.ipon, plan.interestPct) : 0}
            currency={currency}
          />
        )}

        <h4 className="kin-eyebrow" style={{ margin: "1.25rem 0 0.5rem" }}>HISTORY</h4>
        {alkansya.entries.length === 0 ? (
          <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: 0 }}>
            Nothing yet. The allowance arrives on its day, and chore points can be changed into cash.
          </p>
        ) : (
          <div>
            {alkansya.entries.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.625rem", padding: "0.5rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "0.875rem" }}>{entryWords(e).title}</span>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                    {new Date(`${e.occurredOn}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} · {JAR_LABEL[e.jar].name}
                    {entryWords(e).detail ? ` · ${entryWords(e).detail}` : ""}
                  </span>
                </span>
                <span style={{ fontFamily: "var(--font-numeric)", fontWeight: 600, fontSize: "0.875rem", color: e.amount > 0 ? "var(--color-accent-700)" : undefined }}>
                  {e.amount > 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(e.amount), currency)}
                </span>
                {grownUp && <RemoveEntryButton entryId={e.id} memberId={id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A line of history in words: what a grown-up typed, when they typed
 * something, with the kind of entry under it. */
function entryWords(e: AlkansyaEntry): { title: string; detail: string | null } {
  const typed = e.kind === "deposit" || e.kind === "spend" || e.kind === "give";
  if (typed && e.note) return { title: e.note, detail: KIND_LABEL[e.kind] };
  return { title: KIND_LABEL[e.kind], detail: typed || e.kind === "allowance" ? null : e.note };
}

function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
