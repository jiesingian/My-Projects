import Link from "next/link";
import { OPERATOR } from "@/lib/legal";
import { DELETE_GRACE_DAYS } from "@/lib/account-deletion";

export const metadata = {
  title: "Delete your Kin account · Kin",
  description: "How to delete your Kin account and its data, from the app or any browser, and what is deleted or kept.",
};

/** The public page app stores ask for (Google Play's account deletion rule,
 * kin/native/android/store/POLICY.md): how to delete a Kin account without
 * the app installed, and what goes and what stays. The words follow the
 * privacy notice's "How long we keep it" and lib/account-deletion.ts. */
export default function DeleteAccountPage() {
  return (
    <>
      <h1>Delete your Kin account</h1>
      <p>
        You can delete your Kin account, and the information about you in it, at any time, from the Kin app or from any web
        browser. You don&rsquo;t need the app installed.
      </p>

      <h2>From a browser or the app</h2>
      <ol>
        <li>
          Sign in at <Link href="/login">kin-family-app.vercel.app</Link>. Forgot your password?{" "}
          <Link href="/forgot-password">Reset it here</Link>.
        </li>
        <li>
          Open <Link href="/settings/account">Settings → Account</Link>.
        </li>
        <li>
          Choose <strong>Delete my account</strong>, and type &ldquo;delete my account&rdquo; to confirm.
        </li>
      </ol>
      <p>
        Your account is deleted {DELETE_GRACE_DAYS} days later. Changed your mind? Sign in before then and choose{" "}
        <strong>Keep my account</strong>.
      </p>

      <h2>Can&rsquo;t sign in?</h2>
      <p>
        {OPERATOR.email ? (
          <>
            Write to <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
          </>
        ) : (
          <>Write to the developer email shown on Kin&rsquo;s Google Play or App Store page</>
        )}{" "}
        from the email address you signed up with, and say you want your Kin account deleted. We delete it within 30 days and
        reply when it is done.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your sign-in: your email and password.</li>
        <li>Your personal space, and the health records about you.</li>
        <li>Your profile details.</li>
        <li>
          When no grown-up is left in the household: the household and everything in it, including its files and the
          profiles of children it managed.
        </li>
      </ul>

      <h2>What is kept, and for how long</h2>
      <ul>
        <li>
          What you added for the household (a shared plan, a bill, a chat message) stays for the rest of the family, shown as
          &ldquo;Former member&rdquo;.
        </li>
        <li>Our providers&rsquo; backups can keep a copy for a short time before it is overwritten.</li>
      </ul>

      <p>
        More in the <Link href="/legal/privacy">privacy notice</Link>.
      </p>
    </>
  );
}
