import Link from "next/link";
import { OperatorDetails } from "@/components/legal-operator";
import { ConsentReset } from "@/components/consent-banner";
import { AD_TRACKING_ON, OPERATOR } from "@/lib/legal";

export const metadata = {
  title: "Privacy notice · Kin",
  description: "What Kin collects about your family, why, who can see it, and your rights under the Data Privacy Act of 2012.",
};

/** Written against the Data Privacy Act of 2012 (RA 10173), its rules and the
 * National Privacy Commission's circulars, and checked line by line against
 * the code on 29 October 2026: the schema in supabase/migrations, every
 * outside service the server or the page calls, the deletion job
 * (20261022160000_last_grownup_takes_household.sql) and the export
 * (lib/actions/export.ts). Every claim here is meant to be true of the app as
 * built; when the app changes, this changes in the same pull request. The
 * cookie page (legal/cookies) lists what is kept on the device. A draft for
 * a Philippine lawyer to read, not legal advice. */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy notice</h1>
      <p>
        Kin is a private space for one household: its calendar, lists, chat, memories, health records, money and
        documents. This notice says what Kin keeps about you and your family, why, who can see it, how long it is kept,
        and what you can ask us to do with it. It is written for the Data Privacy Act of 2012 (Republic Act 10173).
        &ldquo;We&rdquo; means the people who run Kin, named at the end of this page.
      </p>

      <h2>What Kin keeps</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and a password. The password is stored only as a one-way hash
          by our sign-in provider, never as text. The sign-in provider also records the network address and browser of
          each sign-in, to keep accounts secure.
        </li>
        <li>
          <strong>Your profile:</strong> your name, and whatever else you choose to fill in: birthday, place of birth, sex,
          mobile number, email, photo and colour; height, weight, blood type, allergies, doctor and health insurance;
          SSS, PhilHealth, Pag-IBIG and TIN numbers; schools; employer and work contact; and clothing sizes. Every one of
          these except your name is optional.
        </li>
        <li>
          <strong>What your household adds:</strong> calendar entries, school days and pickups, chores and rewards, the
          shopping list, pantry, recipes and meal plans, chat messages with their photos, voice notes and files, calls
          (who called whom, and when; never what was said), journal entries, photos, milestones and time capsules, the
          family tree and its stories, pets and their vet records, home upkeep, the typhoon checklist, polls, gift lists
          and gift draws, events and their guests, and links.
        </li>
        <li>
          <strong>Sensitive personal information</strong>, when your household adds it:
          <ul>
            <li>
              health records: conditions, medicines and doses, vitals and lab results, illnesses, doctor visits,
              vaccinations and the emergency card;
            </li>
            <li>
              money: accounts and their numbers and QR codes, balances, budgets, bills, income, assets, debts, goals,
              remittances, loans between people (utang), savings circles (paluwagan) and loyalty cards;
            </li>
            <li>government ID numbers, if you add them to a profile;</li>
            <li>documents and passwords in the vault; and</li>
            <li>information about children, added by a parent or guardian.</li>
          </ul>
        </li>
        <li>
          <strong>People who are not Kin users</strong>, when your household adds them: relatives in the family tree
          (living or not), emergency contacts and their phone numbers, household helpers, and event guests. Please add
          someone only if they would expect it.
        </li>
        <li>
          <strong>Location:</strong>
          <ul>
            <li>
              if you switch location sharing on, your phone&rsquo;s latest position while Kin is open. Only the latest one
              is kept; each new one replaces it.
            </li>
            <li>
              if you press SOS or &ldquo;I&rsquo;ve arrived&rdquo;, your position at that moment, even with sharing off.
              An SOS alert is kept in the household&rsquo;s SOS history; &ldquo;I&rsquo;ve arrived&rdquo; posts a map link
              in the chat.
            </li>
          </ul>
        </li>
        <li>
          <strong>Technical data</strong> needed to run the service: the push address of each phone or browser that gets
          Kin&rsquo;s notifications; the public keys of passkeys and a hash of your vault PIN, if you set them; the email
          of a Google account you connect; and a log of errors the app hits. Before an error is saved, emails, long
          numbers, links and anything that looks like an ID are removed, and no account, network address or device is
          attached to it.
        </li>
        <li>
          <strong>On your device:</strong> a few cookies and saved settings, and an offline copy of some of your
          household&rsquo;s records so Kin works without a signal. The <Link href="/legal/cookies">cookies page</Link>{" "}
          lists each one.
        </li>
      </ul>
      <p>
        Kin has no advertising, no analytics and no tracking inside the app, and keeps no record of which screens you
        open.
      </p>

      <h2>Why, and on what basis</h2>
      <p>
        We use this information only to run Kin for your household: to show it to the people who are allowed to see it,
        to send the reminders and alarms you have switched on, to answer when you ask Kin AI something, to keep the
        service secure and fix what breaks, and to manage your plan.
      </p>
      <ul>
        <li>
          Personal information is processed because it is needed to provide the service you signed up for (Data Privacy
          Act, section 12).
        </li>
        <li>
          Sensitive personal information (health, money, ID numbers, children&rsquo;s details) is processed on the basis of
          your consent (section 13), which you give by adding it for that purpose. You can withdraw it at any time by
          deleting the information or your account.
        </li>
        <li>Information about others you add is processed on your behalf, for your household&rsquo;s own use.</li>
      </ul>
      <p>
        <strong>We do not sell your information.</strong> Kin AI&rsquo;s provider, Anthropic, does not use your
        household&rsquo;s records to train its models under its commercial terms, and neither do we.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>
          <strong>Your household.</strong> Records belong to your household and are walled off from every other household
          by the database&rsquo;s own access rules. Inside the household, some records can be limited to grown-ups or to
          the person they are about. The vault can be locked with a PIN, Face ID or a fingerprint. The lock is optional
          and guards the screen; it is not separate encryption.
        </li>
        <li>
          <strong>Relatives you link to.</strong> Another household you connect with sees your name, photo and household
          name; birthdays and occasions; the journal entries and milestones your household shares; and what you put in a
          shared space (the family chat room, the shared family tree, a gift draw, a shared pot). You can keep any entry
          private or switch sharing off. A person you connect with directly can message you.
        </li>
        <li>
          <strong>Service providers who run Kin for us</strong>, only as far as each needs:
          <ul>
            <li>Supabase: the database, sign-in and file storage (servers in Singapore).</li>
            <li>Vercel: hosting the app (servers in Singapore, delivered over a global network).</li>
            <li>
              Anthropic (Kin AI): the question you ask and the household records it looks up to answer it; a photo or
              bank statement you ask it to read; and, when you ask for a catch-up on a chat you missed, the messages in
              that chat, including other people&rsquo;s.
            </li>
            <li>
              Google: only if you connect Google Calendar or Google Drive, what those connections sync. Notifications to
              the Android app go through Google&rsquo;s Firebase Cloud Messaging.
            </li>
            <li>
              Apple: on the Kin iPhone app, to deliver its notifications, calls and alarm updates (the phone&rsquo;s push
              address and the notification itself).
            </li>
            <li>
              The push service of your browser (Google, Apple or Mozilla), if you allow notifications in a browser: the
              notification itself.
            </li>
            <li>
              Calls: Cloudflare and Google help two phones find each other, and see their network addresses. If a call
              needs a relay, the relay passes encrypted call data and cannot hear or see the call.
            </li>
            <li>Open-Meteo: a position rounded to about 100 metres, to show the weather where a family member is.</li>
            <li>OpenStreetMap: the words you type when you search for a place.</li>
            <li>Giphy: the words you type when you search for a GIF; GIFs in the chat load from Giphy.</li>
            <li>
              Have I Been Pwned: the first five characters of a scrambled form of a vault password, to warn you if it has
              leaked. The password itself never leaves Kin.
            </li>
            <li>
              Voice typing uses your browser&rsquo;s own speech recognition; in Chrome, Google turns the speech into
              text.
            </li>
            <li>A payment provider, once paid plans can be bought in Kin: only what is needed to take the payment.</li>
          </ul>
        </li>
        <li>
          If you subscribe to your Kin calendar from Google, Apple or Outlook, that calendar service fetches it from its
          private link.
        </li>
        <li>Authorities, only when Philippine law requires it.</li>
      </ul>
      <p>
        Because these providers operate outside the Philippines, your information is transferred abroad. We remain
        responsible for it there, and use providers who protect it to a standard comparable to the Data Privacy Act.
      </p>

      {/* The ad stage (21 October): shown only once Jonathan switches it on
          (lib/legal.ts, AD_TRACKING_ON), with the banner that asks. */}
      {AD_TRACKING_ON && (
        <>
          <h2 id="advertising">Advertising on our public pages</h2>
          <p>
            {OPERATOR.name ?? "Kin's operator"}
            {OPERATOR.address ? `, ${OPERATOR.address},` : ""} advertises Kin on Facebook and Instagram. To learn which ads
            bring people to Kin, the home page and the feature pages can use the <strong>Meta Pixel</strong> and Meta&rsquo;s{" "}
            <strong>Conversions API</strong>, from Meta Platforms Ireland Ltd. They do so only if you choose{" "}
            <strong>Accept</strong> on the banner those pages show; until then, or if you choose Decline, nothing is sent to
            Meta.
          </p>
          <p>
            If you accept, Meta receives that this browser visited the page, which page, and whether you went on to create
            an account, with the technical details any web visit carries (address, browser). Meta may link that to your
            Facebook or Instagram account under its own policy. Nothing from inside Kin, your household or your records is
            ever sent, and the app itself never loads either one.
          </p>
          <p>Your choice is kept in this browser only. You can change it at any time:</p>
          <ConsentReset />
        </>
      )}

      <h2>How long we keep it</h2>
      <ul>
        <li>Your household&rsquo;s records: for as long as your account and household exist, unless you delete them sooner.</li>
        <li>
          Deleting your account (Settings → Account, or{" "}
          <Link href="/legal/delete-account">from any browser</Link>) takes effect after 7 days, in case you change your mind. Then your sign-in, your personal space, the health records
          about you and your profile details are deleted, and what you added for the household (a plan, a bill, a chat
          message) stays for the rest of the family under &ldquo;Former member&rdquo;. When no grown-up is left, the
          household and everything in it, including its files, is deleted.
        </li>
        <li>Your shared location: only the latest position, replaced by each new one.</li>
        <li>SOS alerts: in the household&rsquo;s SOS history, for as long as the household exists; the position in each is cleared after 30 days.</li>
        <li>Error logs: 30 days. Records of which reminders were sent: 40 days. A screenshot you send to Kin: 24 hours.</li>
        <li>
          Deleting your account also withdraws Kin&rsquo;s Google Calendar permission at Google, and the household&rsquo;s Google
          Drive permission when the household itself is deleted. To withdraw either sooner, or to check, go to{" "}
          <a href="https://myaccount.google.com/permissions" rel="noreferrer">
            myaccount.google.com/permissions
          </a>
          .
        </li>
        <li>
          Our providers&rsquo; backups can keep a copy for a short time after something is deleted before it is
          overwritten.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        Kin is for families, and is meant to be used by children only with a parent or guardian. A parent or guardian
        adds a child as a managed profile and decides what is recorded about them. A child can also have their own
        login: they sign up and ask to join with the household&rsquo;s invite code, and the household&rsquo;s organizer
        approves them as a child. A child&rsquo;s login starts in kid view, which keeps money, the vault and health
        records out of reach, and a child cannot connect with anyone outside the household without a parent&rsquo;s yes.
        A parent or guardian can ask us to see, correct or delete what Kin holds about their child, using the contact
        below.
      </p>

      <h2>Keeping it safe</h2>
      <p>
        Information travels encrypted, is stored encrypted by our providers, and each household is separated from every
        other by the database&rsquo;s own access rules. No system is perfectly secure. If a breach ever puts your
        information at risk of serious harm, we will tell the National Privacy Commission and the people affected within
        72 hours of knowing, as the law requires.
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
      <p>
        You can download a copy of your profile, your own uploads, the messages you sent and your household&rsquo;s records
        yourself, from Settings → Account → Download my data. Messages other people sent you are theirs and are not in
        it. For anything it leaves out, or anything else on this page, write to us at the contact below. We answer
        within 15 days.
      </p>
      <p>
        If you live outside the Philippines, Kin is still run from the Philippines under Philippine law, and you can use
        all the rights above.
      </p>

      <h2>Changes</h2>
      <p>
        If this notice changes in a way that matters, we will say so in Kin before it takes effect. The date at the top
        is the current version. See also the <Link href="/legal/terms">terms</Link>, the{" "}
        <Link href="/legal/refunds">refund policy</Link> and the <Link href="/legal/cookies">cookies page</Link>.
      </p>

      <h2>Who runs Kin, and how to reach our Data Protection Officer</h2>
      <OperatorDetails />
    </>
  );
}
