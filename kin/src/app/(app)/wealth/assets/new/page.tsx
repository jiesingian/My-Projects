import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { AddHoldingForm } from "./add-holding-form";

export default async function NewHoldingPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { kind } = await searchParams;

  return (
    <div>
      <DetailHeader backHref="/wealth?seg=assets" eyebrow="HUB 05 · NEW" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Add holding</h3>
        <AddHoldingForm defaultKind={kind ?? "asset"} />
      </div>
    </div>
  );
}
