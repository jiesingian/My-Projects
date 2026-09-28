import Link from "next/link";
import { OperatorDetails } from "@/components/legal-operator";

export const metadata = {
  title: "Privacy notice · Kin",
  description: "What Kin collects about your family, why, who can see it, and your rights under the Data Privacy Act of 2012.",
};

/** Written against the Data Privacy Act of 2012 (RA 10173) and what the code
 * actually does on 28 September 2026. Every claim here is meant to be true of
 * the app as built; when the app changes, this changes in the same pull
 * request. A draft for legal review, not legal advice. */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy notice</h1>
      <p>
        Kin is a private space for one household: its calendar, lists, chat, memories, health records, money and
        documents. This notice says what Kin keeps about you and your family, why, who can see it, and what you can ask
        us to do with it. It is written for the Data Privacy Act of 2012 (Republic Act 10173).
      </p>

      <h2>What Kin keeps</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and a password. The password is stored only as a
          one-way hash by our sign-in provider, never as text.
        </li>
        <li>
          <strong>Your profile:</strong> name, and if you add them, birthday, mobile number, photo and colour.
        </li>
        <li>
          <strong>What your household adds:</strong> calendar entries, chores and rewards, shopping lists, the pantry,
          meal plans, chat messages and their photos, voice notes and files, journal entries and photos, the family
          tree, and links.
        </li>
        <li>
          <strong>Sensitive personal information</strong>, when your household adds it: health records (conditions,
          medicines and doses, vitals, illnesses, visits, vaccinations, the emergency card), financial records
          (accounts, balances, budgets, bills, goals, transactions), documents and shared passwords in the vault, and
          information about children added by a parent or guardian.
        </li>
        <li>
          <strong>Location</strong>, only for a person who switches location sharing on, and only while Kin is open on
          their phone.
        </li>
        <li>
          <strong>Technical data</strong> needed to run the service: which devices receive notifications, and basic
          logs kept by our hosting providers.
        </li>
      </ul>

      <h2>Why, and on what basis</h2>
      <p>
        We use this information only to run Kin for your household: to show it to the people in your family who are
        allowed to see it, to send the reminders you have switched on, to answer when you ask Kin AI something, to keep
        the service secure, and to manage your plan. We process sensitive personal information on the basis of your
        consent, which you give by adding it, and everything else to provide the service you signed up for. You can
        withdraw consent by deleting the information or your account.
      </p>
      <p>
        <strong>We do not sell your information, show you ads, or use your family&rsquo;s records to train AI
        models.</strong>
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          <strong>Your household.</strong> Records belong to your household and are walled off from every other
          household in the database itself. Inside the household, some records can be limited to grown-ups or to the
          person they are about, and the vault needs a PIN or Face ID.
        </li>
        <li>
          <strong>Relatives you link to.</strong> Only journal entries and milestones your household shares, and you can
          keep any one private or switch sharing off.
        </li>
        <li>
          <strong>Service providers who run Kin for us</strong>, only as far as each needs:
          <ul>
            <li>Supabase: the database, sign-in and file storage (servers in Singapore).</li>
            <li>Vercel: hosting the app (global network).</li>
            <li>Google: only if you connect Google Calendar or Google Drive, and only what those connections sync.</li>
            <li>
              Anthropic: only the question you ask Kin AI, the household records it looks up to answer it, or the photo
              you ask it to scan. Under Anthropic&rsquo;s commercial terms this is not used to train its models.
            </li>
            <li>A call relay, if one is set up: it passes encrypted call data and cannot hear or see the call.</li>
            <li>A payment provider, once paid plans can be bought in Kin: only what is needed to take the payment.</li>
          </ul>
        </li>
        <li>Authorities, only when Philippine law requires it.</li>
      </ul>
      <p>
        Because these providers operate outside the Philippines, your information is transferred abroad. We use
        providers who protect it to a standard comparable to the Data Privacy Act.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account and household exist. Deleting your account (Settings → Account) removes you from the
        household and deletes your sign-in. When the last member leaves, the household and everything in it, including
        its files, is deleted. Providers&rsquo; backups can keep a copy for a short time after that before it is
        overwritten.
      </p>

      <h2>Children</h2>
      <p>
        Children under 13 do not create accounts. A parent or guardian adds them as a managed profile and decides what is
        recorded about them. An older child can have their own login, created by a grown-up in the household, and a
        grown-up can put them in kid view, which keeps money, the vault and health records out of reach.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Information travels encrypted, each household is separated from every other by the database&rsquo;s own access
        rules, and the vault needs a second unlock. If a breach ever puts your information at risk, we will tell the
        National Privacy Commission and the people affected within 72 hours of knowing, as the law requires.
      </p>

      <h2>Your rights</h2>
      <p>Under the Data Privacy Act you have the right to:</p>
      <ul>
        <li>be told how your information is used (this notice);</li>
        <li>see the information Kin holds about you, and get a copy of it in a form you can take elsewhere;</li>
        <li>correct it (most of it you can edit in Kin directly);</li>
        <li>object to its use, or have it deleted or blocked;</li>
        <li>be compensated for damage caused by its misuse; and</li>
        <li>
          complain to the National Privacy Commission at{" "}
          <a href="https://privacy.gov.ph/" rel="noreferrer">
            privacy.gov.ph
          </a>
          .
        </li>
      </ul>
      <p>You can download a copy of everything you can see in Kin yourself, from Settings → Account → Download my data. For anything else, write to the email below. We answer within 15 days.</p>

      <h2>Changes</h2>
      <p>
        If this notice changes in a way that matters, we will say so in Kin before it takes effect. The date at the top
        is the current version. See also the <Link href="/legal/terms">terms</Link> and the{" "}
        <Link href="/legal/refunds">refund policy</Link>.
      </p>

      <h2>Who runs Kin</h2>
      <OperatorDetails />
    </>
  );
}
