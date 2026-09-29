import Link from "next/link";
import { OperatorDetails } from "@/components/legal-operator";
import { PLANS, pesos } from "@/lib/billing/plans";
import { TRIAL_DAYS } from "@/lib/access";

export const metadata = {
  title: "Terms of service · Kin",
  description: "The agreement for using Kin: accounts, households, Kin Free and Kin Plus, the trial, payments and your content.",
};

/** A draft for legal review, not legal advice. Prices come from plans.ts so
 * the terms can never quote a different number from the plan screen. */
export default function TermsPage() {
  return (
    <>
      <h1>Terms of service</h1>
      <p>
        These terms are the agreement between you and Kin when you create an account or use the app. By using Kin you
        accept them. If you do not agree, please do not use Kin.
      </p>

      <h2>Accounts and households</h2>
      <ul>
        <li>
          You must be 18 or older, or have a parent or guardian&rsquo;s permission, to create an account. Children under
          13 are added by a parent or guardian as managed profiles.
        </li>
        <li>
          Everything in Kin belongs to a household. The person who creates it is its organizer, who manages members and
          the plan. The organizer can pass the role to another member.
        </li>
        <li>
          Keep your password to yourself. You are responsible for what is done with your account, and for the members
          you add.
        </li>
      </ul>

      <h2>Kin Free, Kin Plus and the trial</h2>
      <ul>
        <li>
          <strong>Kin Free</strong> costs nothing and has no time limit.
        </li>
        <li>
          <strong>Kin Plus</strong> costs {pesos(PLANS.monthly.amountCents)} a month or {pesos(PLANS.annual.amountCents)} a
          year for the whole household. Prices are in Philippine pesos and include any tax that applies.
        </li>
        <li>
          A new household can get <strong>{TRIAL_DAYS} days of Kin Plus free</strong>. No payment details are asked for, and
          nothing is charged when it ends: the household moves to Kin Free.
        </li>
        <li>
          On Kin Free, everything your household added in a Plus area stays yours to open, change or delete. Adding new
          entries there needs Plus.
        </li>
        <li>
          We may change what each plan includes or costs. A price change never applies to a period you have already paid
          for, and we will tell the organizer in Kin at least 30 days before it applies to them.
        </li>
      </ul>

      <h2>Paying and renewing</h2>
      <ul>
        <li>
          A monthly plan renews every month and a yearly plan every year, until it is cancelled. Payments by GCash or
          Maya may need to be renewed by hand each time; Kin will remind the organizer before a period ends.
        </li>
        <li>
          The organizer can cancel at any time from Settings → Your plan. Plus stays on until the end of the period
          already paid for, then the household moves to Kin Free.
        </li>
        <li>
          Refunds follow the <Link href="/legal/refunds">refund policy</Link>. If you bought Plus through the App Store or
          Google Play, their billing and refund rules apply to that purchase.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        What your household puts in Kin stays yours. You allow us to store, copy and show it only as needed to run Kin
        for your household and the relatives you share with. The <Link href="/legal/privacy">privacy notice</Link>{" "}
        explains how it is handled.
      </p>

      <h2>Using Kin fairly</h2>
      <p>Do not use Kin to break the law, to harm or harass anyone, to store content you have no right to, or to try to reach another household&rsquo;s information or disrupt the service.</p>

      <h2>Kin AI, health and money</h2>
      <p>
        Kin AI can make mistakes: check what it adds or tells you before relying on it. Kin&rsquo;s health, medicine and
        money features help a family keep track; they are not medical, financial or legal advice. In an emergency, call
        911 or go to the nearest hospital.
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep Kin running and your records safe, but the service may sometimes be unavailable, and features may
        change. Keep your own copy of anything you could not do without.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can delete your account at any time in Settings → Account. We may suspend or close an account that breaks
        these terms, and will tell you why unless the law prevents it.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent Philippine law allows, Kin is not liable for indirect or consequential loss, and our total liability
        to you is limited to what you paid for Kin in the 12 months before the claim. Nothing here limits your rights as a
        consumer under the Consumer Act of the Philippines or other law that cannot be set aside by agreement.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of the Philippines.</p>

      <h2>Who runs Kin</h2>
      <OperatorDetails />
    </>
  );
}
