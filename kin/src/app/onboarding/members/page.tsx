import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Blueprint, Tag } from "@/components/ui";
import { AddChildForm } from "@/components/add-child-form";
import { CopyInviteCode } from "@/components/copy-invite-code";
import { formatAge } from "@/lib/format";

export default async function MembersPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("members")
    .select("*")
    .eq("family_id", me.family_id)
    .order("created_at");

  return (
    <OnboardingShell step="STEP 05 / 05" backHref="/onboarding/family">
      <h2 style={{ fontSize: 34, margin: "0 0 18px" }}>Who is in it</h2>
      <div className="field" style={{ marginBottom: 20 }}>
        <label>HOUSEHOLD NAME</label>
        <input className="input" value={me.families.name} disabled style={{ minHeight: 44 }} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--color-divider)",
          paddingBottom: 7,
        }}
      >
        <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)" }}>
          MEMBERS · {members?.length ?? 0}
        </span>
        <span style={{ font: "600 10px/1 var(--font-heading)", letterSpacing: ".14em", color: "var(--color-neutral-600)" }}>
          STATUS
        </span>
      </div>
      {(members ?? []).map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "12px 0",
            borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
          }}
        >
          <div
            className="placeholder-fill"
            style={{
              width: 40,
              height: 40,
              flex: "none",
              border: "1px solid var(--color-divider)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "600 14px/1 var(--font-heading)",
              color: "var(--color-neutral-700)",
            }}
          >
            {m.full_name[0]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 17px/1.1 var(--font-heading)" }}>{m.full_name}</div>
            <div style={{ fontSize: 11.5, color: "var(--color-neutral-600)" }}>
              {formatAge(m.dob)} · {m.role.replace("_", " ")}
              {m.is_organiser ? " · organiser" : ""}
            </div>
          </div>
          <Tag variant={m.auth_user_id === me.auth_user_id ? "accent" : m.status === "managed" ? "neutral" : "outline"}>
            {m.auth_user_id === me.auth_user_id ? "YOU" : m.status.toUpperCase()}
          </Tag>
        </div>
      ))}

      <AddChildForm />

      <Blueprint className="bg-[var(--color-accent-100)] mt-5" style={{ padding: 14 }}>
        <div
          style={{
            font: "600 10px/1 var(--font-heading)",
            letterSpacing: ".14em",
            color: "var(--color-accent-700)",
            marginBottom: 7,
          }}
        >
          INVITE CODE
        </div>
        <CopyInviteCode code={me.families.invite_code} />
      </Blueprint>

      <Link href="/today" className="btn btn-primary btn-block" style={{ marginTop: 24, minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>
        ENTER KIN
      </Link>
    </OnboardingShell>
  );
}
