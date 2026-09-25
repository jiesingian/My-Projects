import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";

/** Kid view (approved 25 September, K1-K3): a simpler Kin for a child with a
 * login of their own, switched on and off by a grown-up. The database keeps
 * the switch out of the child's hands (members_guard_kid_view); this file is
 * what the app does with it. */
export function inKidView(member: { role: string; kid_view?: boolean | null }): boolean {
  return member.role === "child_self" && member.kid_view === true;
}

/** For the pages behind the tabs kid view hides -- money, the household's
 * running, the vault, family health, most of Settings. Typing the address
 * sends a child in kid view back to Today rather than showing a page the
 * tab bar was never going to lead to (K2). */
export async function keepKidViewOut(): Promise<void> {
  const me = await getCurrentMember();
  if (me && inKidView(me)) redirect("/today");
}
