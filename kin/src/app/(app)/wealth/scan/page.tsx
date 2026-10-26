import { redirect } from "next/navigation";
import { familyDay } from "@/lib/time";
import { getCurrentMember } from "@/lib/session";
import { toPickable } from "@/lib/account-picker";
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
          accounts={toPickable(accounts, me.id, { everyone: true })}
          currency={me.families.currency}
          ready={kinAiReady()}
          plus={readAccess(me.families).plus}
          today={familyDay(new Date(), me.families.time_zone || undefined)}
        />
      </div>
    </div>
  );
}
