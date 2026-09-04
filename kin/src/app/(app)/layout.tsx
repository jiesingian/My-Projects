import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { TabBar } from "@/components/tab-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");
  if (member.status === "pending") redirect("/onboarding/pending");

  return (
    <div style={{ minHeight: "100dvh" }}>
      {/* Clears the fixed tab bar so the last row of any page stays reachable. */}
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
        }}
      >
        {children}
      </div>
      <TabBar />
    </div>
  );
}
