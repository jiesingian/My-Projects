import Link from "next/link";

export const metadata = {
  title: "Credits and licences · Kin",
  description: "The open-source software, data and services Kin is built with, and their licences.",
};

/** Where everything in Kin comes from (legal readiness, 29 October), checked
 * against the repository: no bundled fonts (system stacks, globals.css), no
 * icon set (components/icons.tsx is drawn in-house), no sound files (alarms and
 * rings are Web Audio or the phone's own), and screenshots of the sample
 * household. The full licence texts are generated at every build
 * (scripts/third-party-notices.mjs). A new image, font, sound or data
 * source adds its line here in the same pull request. */
export default function LicensesPage() {
  return (
    <>
      <h1>Credits and licences</h1>
      <p>Kin is built on open-source software and a few open data services. This page says what they are and where their licences are.</p>

      <h2>Open-source software</h2>
      <p>
        The libraries Kin is built with, among them React, Next.js, Supabase&rsquo;s client, Radix UI, visx, pdf.js and
        Google&rsquo;s MediaPipe, are used under their own licences (mostly MIT, ISC, BSD and Apache 2.0). Each one&rsquo;s
        name, version and full licence text is in the{" "}
        <a href="/legal/third-party-notices.txt">third-party notices</a>, made from the exact versions in this build.
      </p>
      <p>
        Video-call backgrounds and effects use MediaPipe&rsquo;s face and selfie models, which load from Google and are
        licensed under Apache 2.0.
      </p>

      <h2>Data and services</h2>
      <ul>
        <li>
          Place search: data &copy;{" "}
          <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">
            OpenStreetMap contributors
          </a>
          , available under the Open Database License.
        </li>
        <li>
          Weather:{" "}
          <a href="https://open-meteo.com/" rel="noreferrer">
            Open-Meteo.com
          </a>
          , under the Creative Commons Attribution 4.0 licence.
        </li>
        <li>GIFs in the chat: Powered by GIPHY.</li>
        <li>
          Exchange rates: <a href="https://frankfurter.dev/" rel="noreferrer">Frankfurter</a>, from European Central Bank
          data. Public holidays: <a href="https://date.nager.at/" rel="noreferrer">Nager.Date</a>.
        </li>
      </ul>

      <h2>Kin&rsquo;s own</h2>
      <ul>
        <li>The Kin name, logo, app icon and icons are Kin&rsquo;s own and are not licensed for other use.</li>
        <li>Pictures on the home page and feature pages are screens from Kin&rsquo;s sample household, not real families.</li>
        <li>Kin uses your device&rsquo;s own fonts and, in the apps, your phone&rsquo;s own alarm and ringtone sounds.</li>
      </ul>

      <p>
        See also the <Link href="/legal/privacy">privacy notice</Link> and the <Link href="/legal/terms">terms</Link>.
      </p>
    </>
  );
}
