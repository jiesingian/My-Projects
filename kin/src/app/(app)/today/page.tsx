import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getHubCards, getTodayBriefing } from "@/lib/queries/today";
import { getRoutinesNeedingAttention, getPendingApprovals, getPendingRedemptions } from "@/lib/queries/routines";
import { TodayTaskList } from "@/components/today-task-list";
import { ApprovalQueue } from "@/components/approval-queue";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { isGrownUp } from "@/lib/roles";
import { FamilyPanel } from "@/components/family-panel";
import { getFamilyPanel } from "@/lib/queries/family-panel";

export default async function TodayPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [{ data: members }, hubs, brief, tasks, awaitingApproval, awaitingRedemption, familyPanel] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("family_id", me.family_id).order("created_at"),
    getHubCards(me.family_id, me.families.currency, me.families.week_start),
    getTodayBriefing(me.family_id, me.families.currency),
    getRoutinesNeedingAttention(me.family_id),
    // Only a grown-up is ever asked to answer for a chore, so only a
    // grown-up pays for the query.
    isGrownUp(me.role) ? getPendingApprovals(me.family_id) : Promise.resolve([]),
    isGrownUp(me.role) ? getPendingRedemptions(me.family_id) : Promise.resolve([]),
    getFamilyPanel(me.family_id),
  ]);

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).toUpperCase();

  return (
    <div style={{ padding: "1.5rem 1.375rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div>
          <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: "0.3125rem" }}>
            {todayLabel}
          </div>
          <h2 style={{ fontSize: "1.875rem" }}>{me.families.name}</h2>
        </div>
        <div style={{ display: "flex" }}>
          {(members ?? []).map((m) => (
            <div
              key={m.id}
              className="placeholder-fill"
              style={{
                width: 27,
                height: 27,
                marginLeft: -6,
                border: "1px solid var(--color-divider)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "600 0.8125rem/1 var(--font-heading)",
                color: "var(--color-neutral-700)",
              }}
            >
              {initials(m.full_name)}
            </div>
          ))}
          <Link href="/settings" className="btn btn-secondary btn-icon" aria-label="Settings" style={{ marginLeft: "0.625rem" }}>
            <Icon name="settings" />
          </Link>
        </div>
      </div>

      {/* The briefing. Everything the household has a date on, from every
          hub, in one list — overdue first, then the day in the order it
          happens. This is the answer to "why would anyone open this app on a
          Tuesday", and the hub cards below are demoted to what they always
          were: a way to get somewhere. */}
      <section style={{ marginBottom: "1.625rem" }}>
        <h3 className="kin-eyebrow">{brief.length > 0 ? "Needs you today" : "Today"}</h3>

        {brief.length === 0 ? (
          <Blueprint style={{ padding: "1.125rem 0.9375rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span className="kin-brief-ico" data-tint="home">
              <Icon name="check" size={17} />
            </span>
            <div>
              <div style={{ font: "600 1rem/1.2 var(--font-heading)" }}>Nothing needs you today</div>
              <div style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
                No bills due, nothing scheduled, the list is clear.
              </div>
            </div>
          </Blueprint>
        ) : (
          <div className="kin-brief">
            {brief.map((b) => (
              <Link key={b.id} href={b.href} className="kin-brief-row" data-urgent={b.urgent ? "true" : undefined}>
                <span className="kin-brief-ico" data-tint={b.tint}>
                  <Icon name={b.icon} size="1.0625rem" />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="kin-brief-title">{b.title}</span>
                  <span className="kin-brief-meta">{b.meta}</span>
                </span>
                <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <ApprovalQueue pending={awaitingApproval} redemptions={awaitingRedemption} />

      <TodayTaskList tasks={tasks} />

      <h3 className="kin-eyebrow">Hubs</h3>
      {/* Two up on a phone, as many as fit on a desktop. Two 500px-wide hub
          cards on a monitor is a wider phone, not a desktop — see
          .kin-hubgrid. */}
      <div className="kin-hubgrid">
        {hubs.map((h) => (
          <Link key={h.n} href={h.href} className={h.span === "full" ? "kin-hub-wide" : undefined}>
            <Blueprint style={{ padding: "0.8125rem", display: "flex", flexDirection: "column", gap: "0.375rem", minHeight: "7.875rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4375rem" }}>
                <Icon name={h.icon} size="1rem" className="text-[var(--color-accent-700)]" />
                <span style={{ font: "400 0.75rem/1 var(--font-numeric)", color: "var(--color-neutral-500)", marginLeft: "auto" }}>
                  {h.n}
                </span>
              </div>
              <div style={{ font: "600 1.3125rem/1 var(--font-heading)" }}>{h.name}</div>
              <div style={{ fontSize: "0.84375rem", lineHeight: 1.35, color: "var(--color-neutral-800)" }}>{h.primary}</div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
                <span style={{ font: "600 1.25rem/1 var(--font-heading)", color: "var(--color-accent-700)" }}>{h.stat}</span>
                <span style={{ fontSize: "0.75rem", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
                  {h.statLabel}
                </span>
              </div>
            </Blueprint>
          </Link>
        ))}
      </div>

      <FamilyPanel data={familyPanel} />
    </div>
  );
}
