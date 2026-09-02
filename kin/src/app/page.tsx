import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");

  redirect("/today");
}
