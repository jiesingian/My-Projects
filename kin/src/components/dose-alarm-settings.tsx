"use client";

import { useState, useTransition } from "react";
import { createDoseAlarmLinkAction, removeDoseAlarmLinkAction } from "@/lib/actions/settings";
import { CopyLink } from "@/components/quick-button-settings";
import { KIN_ALARMS_SHORTCUT_URL } from "@/lib/dose-alarms";

/** Settings → Notifications → Medicine alarms (23 October): the free stopgap
 * until the native app. A "Kin Alarms" Shortcut reads the member's dose times
 * from their private link and makes them iPhone Clock alarms, which ring full
 * screen with sound even on silent (lib/dose-alarms.ts). Built like "Add to
 * Kin": the link is shown once, made and turned off here. The Shortcut comes
 * ready-made from an iCloud link (KIN_ALARMS_SHORTCUT_URL) that asks for the
 * link on import; building it by hand stays as a closed fold, since the
 * hand steps never quite match what the phone shows (26 October). */
export function DoseAlarmSettings({ initialOn, lastRead }: { initialOn: boolean; lastRead: string | null }) {
  const [on, setOn] = useState(initialOn);
  const [url, setUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  function make() {
    startTransition(async () => {
      const r = await createDoseAlarmLinkAction();
      setFailed(r.error);
      if (r.url) {
        setUrl(r.url);
        setOn(true);
      }
    });
  }

  return (
    <div className="kin-quickbtn">
      <section className="kin-quickbtn-section" aria-labelledby="alarms-what">
        <h2 id="alarms-what" className="kin-quickbtn-h">
          Medicine alarms on this iPhone
        </h2>
        <p className="kin-quickbtn-lead">
          On an iPhone, Kin&rsquo;s dose reminder is an ordinary notification: it stays quiet when the phone is on silent. A Clock alarm rings full screen with sound even then. The
          &ldquo;Kin Alarms&rdquo; Shortcut turns your dose times into Clock alarms, labelled &ldquo;Kin · Losartan 50 mg&rdquo;.
        </p>
        <p className="kin-quickbtn-note">
          It makes alarms for your own medicines, and for a grown-up, a child&rsquo;s medicines shared with you. The alarm doesn&rsquo;t know when a dose is taken: tick it in Kin as
          usual. Run the Shortcut again whenever a medicine or a time changes.
        </p>
      </section>

      <section className="kin-quickbtn-section" aria-labelledby="alarms-link">
        <h2 id="alarms-link" className="kin-quickbtn-h">
          Your link
        </h2>
        {url ? (
          <>
            <p className="kin-quickbtn-lead">
              <b>Your private link.</b> Copy it now: Kin shows it only once. It shows your medicines&rsquo; names and times, so keep it in the Shortcut and nowhere else.
            </p>
            <CopyLink label="Kin Alarms" url={url} />
          </>
        ) : (
          <div className="kin-quickbtn-row">
            <button type="button" className="btn btn-primary" onClick={make} disabled={pending}>
              {on ? "Make a new link" : "Make my link"}
            </button>
            {on && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await removeDoseAlarmLinkAction();
                    setFailed(r.error);
                    if (!r.error) setOn(false);
                  })
                }
              >
                Turn it off
              </button>
            )}
          </div>
        )}
        {on && !url && (
          <p className="kin-quickbtn-note">
            Your link is on{lastRead ? `, last read by the Shortcut ${lastRead}` : ", not read by a Shortcut yet"}. A new link replaces it, and the old one stops working.
          </p>
        )}
        {failed && (
          <p role="alert" className="kin-quickbtn-error">
            {failed}
          </p>
        )}
      </section>

      <section className="kin-quickbtn-section" aria-labelledby="alarms-add">
        <h2 id="alarms-add" className="kin-quickbtn-h">
          The Shortcut
        </h2>
        {KIN_ALARMS_SHORTCUT_URL ? (
          <>
            <p className="kin-quickbtn-lead">
              Copy your link first (if you no longer have it, make a new one above). Then add the Shortcut: when it asks for your Kin link, paste it, and tap <b>Add Shortcut</b>. Run it once now, and again after a medicine
              changes.
            </p>
            <div className="kin-quickbtn-row">
              <a className="btn btn-primary" href={KIN_ALARMS_SHORTCUT_URL} target="_blank" rel="noopener noreferrer">
                Add the Kin Alarms Shortcut
              </a>
            </div>
          </>
        ) : (
          <p className="kin-quickbtn-lead">The ready-made Shortcut is coming; your link is ready for it.</p>
        )}
        <details className="kin-quickbtn-more">
          <summary>Build it by hand</summary>
          <ol className="kin-quickbtn-sub kin-quickbtn-brief-steps">
            <li>
              In Shortcuts, tap <b>+</b>, tap the name at the top and call it <b>Kin Alarms</b>.
            </li>
            <li>
              Add <b>Get Contents of URL</b> and paste your link.
            </li>
            <li>
              Add <b>Get Dictionary Value</b>: get the value for <b>status</b>. Then add <b>If</b> it <b>is</b> <b>ok</b>. If the If shows something else, such as{" "}
              <b>File Size</b>, tap <b>Dictionary Value</b> in it and choose <b>Text</b>. The next three steps go inside the If, so a failed read never clears your alarms.
            </li>
            <li>
              Clear the old ones: add <b>Find Alarms</b> where <b>Label</b> begins with <b>Kin ·</b>, then <b>Delete Alarm</b> on them. If your iPhone only offers{" "}
              <b>Toggle Alarm</b>, set it to turn them off, and delete the old ones in Clock now and then.
            </li>
            <li>
              Add <b>Get Dictionary Value</b> for <b>alarms</b> from <b>Contents of URL</b>, then <b>Repeat with Each</b> item in it.
            </li>
            <li>
              Inside the Repeat: <b>Get Dictionary Value</b> for <b>time</b> and for <b>label</b> from <b>Repeat Item</b>, then <b>Create Alarm</b> at that time with that label,
              repeating every day.
            </li>
            <li>
              After the If, add <b>Get Dictionary Value</b> for <b>summary</b> from <b>Contents of URL</b>, and <b>Show Notification</b> with it. It says how many alarms Kin made.
            </li>
            <li>
              Run it once now, and again after a medicine changes. Try one alarm with the phone on silent.
            </li>
          </ol>
        </details>
      </section>
    </div>
  );
}
