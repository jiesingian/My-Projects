import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { AddHoldingForm } from "./add-holding-form";
import { getAttributableTargets } from "@/lib/queries/wealth";

export default async function NewHoldingPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const [{ kind }, targets] = await Promise.all([searchParams, getAttributableTargets(me.family_id)]);

  return (
    <div>
      <DetailHeader backHref="/wealth?seg=assets" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Add holding</h3>
        <AddHoldingForm defaultKind={kind ?? "asset"} assets={targets.assets} />
      </div>
    </div>
  );
}
