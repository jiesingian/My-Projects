import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getAccounts } from "@/lib/queries/wealth";
import { readAccess } from "@/lib/access";
import { kinAiReady } from "@/lib/kin-ai";
import { DetailHeader } from "@/components/hub-header";
import { ReceiptScanner } from "@/components/receipt-scanner";

/** Snap a receipt or an e-wallet screenshot (Jonathan, 20 October; Kin
 * Plus). The picture is read by Kin AI for the amount, date, payee,
 * category and a guess at the account; the member checks every field and
 * presses Record, which goes through the same actions as Move money and
 * Bills. A Free household sees the card and what Plus unlocks, and nothing
 * is sent or counted. Kid view never gets here (the Wealth layout). */
export default async function ScanReceiptPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const accounts = await getAccounts(me.family_id);

  return (
    <div>
      <DetailHeader backHref="/wealth" eyebrow="Wealth" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>Snap a receipt</h3>
        <ReceiptScanner
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, linked_app_url: a.linked_app_url, institution: a.institution, balance: a.balance, is_joint: a.is_joint }))}
          currency={me.families.currency}
          ready={kinAiReady()}
          plus={readAccess(me.families).plus}
        />
      </div>
    </div>
  );
}
