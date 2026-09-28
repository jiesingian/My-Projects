import Link from "next/link";
import { OperatorDetails } from "@/components/legal-operator";

export const metadata = {
  title: "Refunds and cancellation · Kin",
  description: "How to cancel Kin Plus, what happens to your household's records, and when a payment is refunded.",
};

/** A draft for legal review, not legal advice. The refund windows below are a
 * starting proposal for Jonathan; changing them is a business decision. */
export default function RefundsPage() {
  return (
    <>
      <h1>Refunds and cancellation</h1>

      <h2>The free trial</h2>
      <p>The 14-day Kin Plus trial is free and asks for no payment details. There is nothing to cancel: when it ends, the household moves to Kin Free.</p>

      <h2>Cancelling Kin Plus</h2>
      <ul>
        <li>The organizer can cancel at any time from Settings → Your plan.</li>
        <li>Plus stays on until the end of the month or year already paid for. Then the household moves to Kin Free.</li>
        <li>Nothing is deleted. Everything your household added stays yours to open, change or delete.</li>
      </ul>

      <h2>Refunds</h2>
      <ul>
        <li>
          <strong>Charged by mistake, or charged twice:</strong> refunded in full.
        </li>
        <li>
          <strong>A yearly plan:</strong> if you change your mind within 7 days of paying, it is refunded in full.
        </li>
        <li>
          <strong>Otherwise</strong>, a period that has started is not refunded in part, except where the law says
          otherwise.
        </li>
        <li>
          Refunds go back to the way you paid (card, GCash or Maya), usually within 5 to 10 banking days of approval.
        </li>
        <li>
          Bought through the App Store or Google Play? Ask Apple or Google for the refund; they handle those payments.
        </li>
      </ul>

      <h2>How to ask</h2>
      <p>Write to the email below with the household&rsquo;s name and the date of the payment. We reply within 3 working days.</p>
      <p>
        See also the <Link href="/legal/terms">terms</Link> and the <Link href="/legal/privacy">privacy notice</Link>.
      </p>

      <h2>Who runs Kin</h2>
      <OperatorDetails />
    </>
  );
}
