import Link from "next/link";
import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { getTodayBriefing } from "@/lib/queries/today";
import { dosesFor } from "@/lib/health-plan";
import { familyClock, familyDateLong, familyDay } from "@/lib/time";
import { simplePlans } from "@/lib/simple-mode";
import { Icon } from "@/components/icons";
import { SosButton } from "@/components/sos-button";
import { CallFamily, SimpleDoses } from "@/components/simple-today-parts";
import { ArrivedButton } from "@/components/arrived-button";
import { CheckInPrompt } from "@/components/check-in-prompt";
import { ApprovalQueue } from "@/components/approval-queue";
import { PromiseBanner } from "@/components/promise-banner";
import { getMyPendingCheckIns } from "@/lib/queries/member-card";
import { getPendingApprovals, getPendingRedemptions } from "@/lib/queries/routines";
import { getGoalRequestsFor, getPendingGoalClaims, getRewardDuties } from "@/lib/queries/goals";
import { isGrownUp } from "@/lib/roles";

/** Today in Simple Kin (lib/simple-mode, 19 October): the four things a lolo
 * or lola reaches for, each one a big target, and nothing else. Everything
 * else in Kin is still a tab away; this only decides what Today leads with. */
export async function SimpleToday({ me, arrivedNow = false }: { arrivedNow?: boolean; me: { id: string; role: string; family_id: string; full_name: string; families: { currency: string; name: string } } }) {
  const tz = await householdZone();
  const now = new Date();
  const today = familyDay(now, tz);
  const supabase = await createClient();
  const grownUp = isGrownUp(me.role);
  const [brief, { data: medicines }, checkIns, approvals, redemptions, goalRequests, goalClaims, rewardDuties] = await Promise.all([
    getTodayBriefing(me.family_id, me.families.currency, me),
    // Their own medicines only: this screen ticks for the person holding it.
    supabase.from("health_medicines").select("id, member_id, name, dose, times, start_date, end_date").eq("member_id", me.id),
    // What only this person can answer, as on the full Today: an "Are you
    // okay?", a child's chore or reward waiting on a grown-up, a promised
    // reward. Simple Kin hides the rest of Today, so these must not go too.
    getMyPendingCheckIns(me.id),
    grownUp ? getPendingApprovals(me.family_id) : Promise.resolve([]),
    grownUp ? getPendingRedemptions(me.family_id) : Promise.resolve([]),
    getGoalRequestsFor(me.family_id, me),
    grownUp ? getPendingGoalClaims(me.family_id, me) : Promise.resolve([]),
    getRewardDuties(me.family_id, me),
  ]);
  const { data: doses } = medicines?.length
    ? await supabase.from("health_medicine_doses").select("medicine_id, dose_date, dose_time").in("medicine_id", medicines.map((m) => m.id)).eq("dose_date", today)
    : { data: [] };
  const due = dosesFor(medicines ?? [], doses ?? [], today, familyClock(now, tz));
  const plans = simplePlans(brief);
  const first = me.full_name.split(" ")[0];

  return (
    <div className="kin-simple-today" style={{ padding: "1.25rem var(--gutter) 1.375rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.25rem" }}>
        <div style={{ font: "600 1rem/1.2 var(--font-heading)", color: "var(--color-accent-700)" }}>{familyDateLong(now, tz)}</div>
        <span className="kin-simple-sos">
          <SosButton householdName={me.families.name} />
        </span>
      </div>
      <h2 style={{ fontSize: "min(2.25rem, 11vw)", margin: "0 0 1.25rem" }}>Hello, {first}</h2>

      <CheckInPrompt checkIns={checkIns} />
      <PromiseBanner duties={rewardDuties} />

      <section aria-labelledby="simple-meds">
        <h3 id="simple-meds" className="kin-simple-h">My medicines today</h3>
        {due.length === 0 ? (
          <p className="kin-simple-empty">No medicines to take today.</p>
        ) : (
          <SimpleDoses memberId={me.id} day={today} doses={due.map((d) => ({ medicineId: d.medicineId, name: d.name, dose: d.dose, time: d.time, taken: d.taken, late: d.late }))} />
        )}
      </section>

      <section aria-labelledby="simple-plans">
        <h3 id="simple-plans" className="kin-simple-h">Today&rsquo;s plans</h3>
        {plans.length === 0 ? (
          <p className="kin-simple-empty">Nothing planned for today.</p>
        ) : (
          <div className="kin-simple-list">
            {plans.map((b) => (
              <Link key={b.id} href={b.href} className="kin-simple-row">
                <Icon name={b.icon} size="1.5rem" />
                <span style={{ minWidth: 0 }}>
                  <span className="kin-simple-row-title">{b.title}</span>
                  <span className="kin-simple-row-meta">{b.meta}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="simple-family">
        <h3 id="simple-family" className="kin-simple-h">Family</h3>
        <Link href="/chat" className="btn btn-primary btn-block kin-simple-big">
          <Icon name="message" size="1.5rem" /> Message the family
        </Link>
        <CallFamily />
        {/* "Nakarating na ako", which the Action Button opens (/today?arrived=1). */}
        <ArrivedButton auto={arrivedNow} big />
      </section>

      <div id="approvals">
        <ApprovalQueue pending={approvals} redemptions={redemptions} goalRewards={goalRequests.rewards} goalChanges={goalRequests.changes} goalClaims={goalClaims} />
      </div>

      <p style={{ fontSize: "0.9375rem", color: "var(--color-neutral-600)", marginTop: "1.5rem" }}>
        Simple Kin is on. <Link href="/settings/appearance">Change it in Settings</Link>.
      </p>
    </div>
  );
}
