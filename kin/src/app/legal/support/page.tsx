import Link from "next/link";
import { OperatorDetails } from "@/components/legal-operator";
import { OPERATOR } from "@/lib/legal";

export const metadata = {
  title: "Help and support · Kin",
  description: "How to get help with Kin, reach the people who run it, and delete your account.",
};

/** The App Store's Support URL (App Review 1.5: an easy way to reach the
 * developer) and the Play listing's too: public, like the rest of /legal,
 * because people read it before they have an account and a reviewer never
 * has one. The contact line is OPERATOR.email (lib/legal.ts); until it is
 * set the layout above says the details are on their way. */
export default function SupportPage() {
  return (
    <>
      <h1>Help and support</h1>

      <h2>Help inside Kin</h2>
      <p>
        Every part of Kin is explained in Settings → Help, with the steps for each screen. Ask Kin, the round button on every screen,
        also answers questions about your household and how Kin works.
      </p>

      <h2>Write to us</h2>
      <p>
        {OPERATOR.email ? (
          <>
            Email <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> about anything: a problem, a question about your
            data, or something you would like Kin to do.
          </>
        ) : (
          <>Kin&rsquo;s support address will be published here with the business details below.</>
        )}
      </p>

      <h2>The iPhone and Android apps</h2>
      <ul>
        <li>The apps are Kin itself, with alarms that ring like the Clock app, calls that ring like a phone call, and widgets.</li>
        <li>
          Alarms for medicine doses, and for the plans, check-ups and bills you choose, are set in Settings → Notifications
          → Alarms. Allow notifications and alarms when the phone asks.
        </li>
        <li>Signed out, the widgets show nothing about your household.</li>
      </ul>

      <h2>Deleting your account</h2>
      <p>
        In Kin, go to Settings → Account → Delete my account, or follow{" "}
        <Link href="/legal/delete-account">these steps from any browser</Link>. Nothing is removed for 7 days, in case you change your mind;
        signing in during them offers to keep the account. The <Link href="/legal/privacy">privacy notice</Link> says what is
        deleted and what stays with the household.
      </p>

      <h2>Who runs Kin</h2>
      <OperatorDetails />
    </>
  );
}
