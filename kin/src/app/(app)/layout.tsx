import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { TabBar } from "@/components/tab-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");
  if (member.status === "pending") redirect("/onboarding/pending");

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, width: "100%", maxWidth: 720, margin: "0 auto" }}>{children}</div>
      <div style={{ maxWidth: 720, width: "100%", margin: "0 auto" }}>
        <TabBar />
      </div>
    </div>
  );
}
