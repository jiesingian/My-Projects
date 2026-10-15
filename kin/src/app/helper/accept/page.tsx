import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { Blueprint } from "@/components/ui";
import { HELPER_INVITE_COOKIE, HELPER_SWITCH_LABEL, normaliseHelperCode } from "@/lib/helper-access";
import { AcceptHelperLink } from "./accept-form";
import { forgetHelperLinkAction } from "@/lib/actions/helpers";

export const metadata = { title: "Helper link · Kin" };

/** A helper link, opened and signed in (app/helper/join). Says which
 * household it is from and what it shows before anything is accepted; the
 * code itself is checked again by claim_helper_invite(). */
export default async function AcceptHelperPage() {
  if (!(await getSessionUser())) redirect("/login");
  const code = normaliseHelperCode((await cookies()).get(HELPER_INVITE_COOKIE)?.value);
  const supabase = await createClient();
  const { data } = code ? await supabase.rpc("helper_invite_preview", { p_code: code }) : { data: null };
  const invite = data?.[0] ?? null;

  if (!invite) {
    return (
      <OnboardingShell>
        <Wordmark />
        <h2 style={{ fontSize: "1.5rem", margin: "28px 0 12px" }}>This helper link has run out</h2>
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
          It may have been used already, or it is more than 7 days old. Ask the family for a new one.
        </p>
        <form action={forgetHelperLinkAction}>
          <button type="submit" className="btn btn-secondary btn-block" style={{ minHeight: "2.875rem" }}>
            Not now
          </button>
        </form>
      </OnboardingShell>
    );
  }

  const shown = [
    invite.can_see_list && HELPER_SWITCH_LABEL.list,
    invite.can_see_meals && `${HELPER_SWITCH_LABEL.meals}, today and tomorrow`,
    invite.can_see_kids_plans && `${HELPER_SWITCH_LABEL.kids}, today and tomorrow`,
  ].filter((x): x is string => !!x);

  return (
    <OnboardingShell>
      <Wordmark />
      <h2 style={{ fontSize: "1.5rem", margin: "28px 0 12px" }}>Help {invite.household} on Kin</h2>
      <Blueprint style={{ padding: "1rem", marginBottom: "1.25rem" }}>
        <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: "0 0 0.5rem" }}>
          The family added you as <strong>{invite.helper_name}</strong>. You will see:
        </p>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
          {shown.length ? shown.map((s) => <li key={s}>{s}</li>) : <li>Nothing yet. The family can switch things on later.</li>}
        </ul>
      </Blueprint>
      <AcceptHelperLink />
      <form action={forgetHelperLinkAction} style={{ marginTop: "0.625rem" }}>
        <button type="submit" className="btn btn-ghost btn-block" style={{ minHeight: "2.5rem", fontSize: "0.875rem" }}>
          Not now
        </button>
      </form>
    </OnboardingShell>
  );
}
