import Link from "next/link";
import { AD_TRACKING_ON } from "@/lib/legal";

export const metadata = {
  title: "Cookies and device storage · Kin",
  description: "Every cookie Kin sets and everything it keeps on your phone or browser, what each is for, and how long it lasts.",
};

/** Every cookie and every piece of browser or app storage Kin writes, checked
 * against the code on 29 October 2026 (grep for cookies().set, res.cookies.set,
 * document.cookie, localStorage, sessionStorage, indexedDB and caches.open).
 * Add a row here in the same pull request as a new one. While nothing below is
 * for advertising or analytics, Kin asks nothing and shows no banner; the ad
 * stage (lib/legal.ts, AD_TRACKING_ON) adds its own section and banner. */
const COOKIES: [string, string, string][] = [
  ["sb-…-auth-token", "Keeps you signed in (our sign-in provider, Supabase).", "Until you sign out"],
  ["kin_docs_unlock", "Remembers that you unlocked the vault.", "10 minutes"],
  ["kin_webauthn_challenge", "A one-time check while you use Face ID, a fingerprint or a passkey.", "Minutes"],
  ["kin-calendar-oauth-state, kin-drive-oauth-state", "A one-time check while you connect Google Calendar or Drive.", "10 minutes"],
  ["kin-invite, kin-helper-invite, kin-connect", "Remembers the invite link you opened, so you join the right household or person after signing up.", "7 to 14 days"],
  ["kin-referral", "Remembers whose invite link brought you, so the right household gets its days of Plus.", "14 days"],
  ["kin-theme, kin-palette", "Your light or dark choice and colour theme, so the first screen is drawn in them.", "1 year"],
  ["kin_show_chores, kin_cal_hide, kin_today_open_…, kin-plus-trial-card-hidden", "What you chose to show, hide or fold on Today and in the calendar.", "Up to 1 year"],
];

export default function CookiesPage() {
  return (
    <>
      <h1>Cookies and device storage</h1>
      <p>
        Kin keeps a few small things on your phone or browser so it works: that you are signed in, your settings, and
        a copy of some records for when there is no signal.{" "}
        <strong>
          None of it is for advertising or analytics, and nothing is shared with anyone else, so Kin does not ask you to
          accept cookies.
        </strong>
      </p>

      <h2>Cookies</h2>
      <table className="kin-legal-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">What it is for</th>
            <th scope="col">How long</th>
          </tr>
        </thead>
        <tbody>
          {COOKIES.map(([name, why, life]) => (
            <tr key={name}>
              <td>
                <code>{name}</code>
              </td>
              <td>{why}</td>
              <td>{life}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Kept in your browser or the app</h2>
      <ul>
        <li>
          <strong>An offline copy</strong> of your household&rsquo;s chat, plan, shopping list and emergency cards (which
          include health facts and phone numbers), so Kin opens without a signal. It is wiped when you sign out or the
          sign-in screen opens.
        </li>
        <li>
          <strong>Small settings</strong>: which tips, tours and offers you have seen or put off, folded sections, keyboard
          shortcuts, the shop you are shopping for, whether you turned notifications off on this device, and your answers
          on the home page&rsquo;s first questions (they stay on this device).
        </li>
        <li>
          <strong>On a guest link</strong>, the name you gave, so you don&rsquo;t type it twice.
        </li>
        <li>
          <strong>The app&rsquo;s own files</strong> (the offline page, pictures and code), so it loads quickly.
        </li>
        <li>
          <strong>On the iPhone app</strong>, the widgets keep a copy of what they show (your next dose, today&rsquo;s plan,
          the To-Buy count). Signed out, they show nothing.
        </li>
      </ul>
      {AD_TRACKING_ON && (
        <p>
          On the home page and the feature pages only, your answer to the advertising question is kept in this browser.
          See <Link href="/legal/privacy#advertising">Advertising on our public pages</Link>.
        </p>
      )}

      <h2>Clearing them</h2>
      <p>
        Signing out removes the sign-in cookie and the offline copy. Clearing your browser&rsquo;s data for this site, or
        deleting the app, removes everything else. Kin will still work; it will just ask you to sign in and forget your
        settings on that device.
      </p>
      <p>
        See also the <Link href="/legal/privacy">privacy notice</Link>.
      </p>
    </>
  );
}
