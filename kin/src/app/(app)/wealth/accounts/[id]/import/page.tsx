import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getAccountDetail } from "@/lib/queries/wealth";
import { DetailHeader } from "@/components/hub-header";
import { Empty } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PlusNote } from "@/components/plus";
import { readAccess } from "@/lib/access";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";
import { allRows } from "@/lib/queries/all-rows";
import { StatementImporter } from "./import-client";

/** Import a statement into one account: pick a CSV, check the columns,
 * review, save. The file is read in the browser and never uploaded; the
 * account's own movements come along so the review can show what is already
 * there. Kin Plus, like the rest of Wealth. */
export default async function ImportStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const { account } = await getAccountDetail(me.family_id, id);
  if (!account) notFound();

  const back = `/wealth/accounts/${id}`;
  const canWrite = !account.is_archived && (account.is_joint ? isGrownUp(me.role) : account.owner_member_id === me.id);
  if (!canWrite || !readAccess(me.families).plus) {
    return (
      <div>
        <DetailHeader backHref={back} eyebrow="Import a statement" />
        <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
          {!readAccess(me.families).plus ? (
            <PlusNote area="Importing a statement" />
          ) : (
            <Empty icon={<Icon name="upload" size={26} />} title="Not this account" line={account.is_archived ? "An archived account takes no new movements." : "Only the grown-ups import into a joint account, and only its owner into a personal one."} />
          )}
        </div>
      </div>
    );
  }

  // Every movement already in the account, as the duplicate check reads it:
  // the household's day, direction, amount, description.
  const tz = me.families.time_zone || undefined;
  const supabase = await createClient();
  const data = await allRows((a, b) =>
    supabase.from("wealth_transactions").select("occurred_at, direction, amount, particulars").eq("account_id", id).eq("family_id", me.family_id).order("id").range(a, b),
  );
  const existing = data.map((t) => ({ date: familyDay(new Date(t.occurred_at), tz), direction: t.direction, amount: Number(t.amount), particulars: t.particulars }));

  return (
    <div>
      <DetailHeader backHref={back} eyebrow="Import a statement" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 0.25rem" }}>Import a statement</h3>
        <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-600)", margin: "0 0 1rem", lineHeight: 1.45 }}>
          Into <b>{account.name}</b>. The file is read on this device and never uploaded or kept; only the lines you tick are saved. Lines already in the account are left out.
        </p>
        <StatementImporter accountId={id} existing={existing} currency={me.families.currency} />
      </div>
    </div>
  );
}
