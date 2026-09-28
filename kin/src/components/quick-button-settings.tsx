"use client";

import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { Icon } from "@/components/icons";
import { setQuickButtonAction } from "@/lib/actions/settings";
import {
  QUICK_ACTIONS,
  QUICK_BUTTONS,
  QUICK_SLOTS,
  QUICK_SLOT_NAMES,
  gestureFor,
  type QuickActionId,
  type QuickButton,
  type QuickPrefs,
  type QuickSlot,
} from "@/lib/quick-button";

const noSubscribe = () => () => {};

/** Settings → Quick button: which of the phone's buttons, what each press
 * does, and the one-time Shortcuts setup that points the button at Kin. */
export function QuickButtonSettings({ initial }: { initial: QuickPrefs }) {
  const [prefs, setPrefs] = useState<QuickPrefs>(initial);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const uid = useId();
  // The links are shown whole, because that is what gets pasted into
  // Shortcuts; the origin is only known in the browser.
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");

  function save(next: QuickPrefs) {
    const previous = prefs;
    setPrefs(next);
    startTransition(async () => {
      const { error } = await setQuickButtonAction(next);
      setFailed(error);
      if (error) setPrefs(previous);
    });
  }

  const iphone = prefs.button !== "android";

  return (
    <div className="kin-quickbtn">
      <div className="kin-quickbtn-label">Which button</div>
      <div className="kin-quickbtn-buttons" role="radiogroup" aria-label="Which button">
        {QUICK_BUTTONS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={prefs.button === b.id}
            disabled={pending}
            className="kin-quickbtn-choice"
            onClick={() => prefs.button !== b.id && save({ ...prefs, button: b.id as QuickButton })}
          >
            <span className="kin-quickbtn-choice-name">{b.name}</span>
            <span className="kin-quickbtn-choice-line">{b.line}</span>
          </button>
        ))}
      </div>

      <div className="kin-quickbtn-label">What each press does</div>
      <div className="kin-quickbtn-slots">
        {QUICK_SLOTS.map((slot) => {
          const gesture = gestureFor(prefs.button, slot);
          const off = iphone && !gesture;
          return (
            <div key={slot} className="kin-quickbtn-slot" data-off={off || undefined}>
              <label htmlFor={`${uid}-${slot}`}>
                <span className="kin-quickbtn-slot-name">{QUICK_SLOT_NAMES[slot]}</span>
                {iphone && <span className="kin-quickbtn-slot-gesture">{gesture ?? "Back Tap has only two taps"}</span>}
              </label>
              <select
                id={`${uid}-${slot}`}
                className="input"
                value={prefs[slot]}
                disabled={pending}
                onChange={(e) => save({ ...prefs, [slot]: e.target.value as QuickActionId })}
              >
                {QUICK_ACTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      {failed && (
        <p role="alert" className="kin-quickbtn-error">
          {failed}
        </p>
      )}
      <p className="kin-quickbtn-note">Changes work straight away. Set the button up once below; after that, change what it does here.</p>

      <div className="kin-quickbtn-label">Set it up once</div>
      {iphone ? <IphoneSteps button={prefs.button} origin={origin} /> : <AndroidSteps origin={origin} />}
    </div>
  );
}

function CopyLink({ url, slot }: { url: string; slot: QuickSlot }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="kin-quickbtn-link">
      <code>{url}</code>
      <button
        type="button"
        className="btn btn-secondary"
        aria-label={`Copy the ${QUICK_SLOT_NAMES[slot].toLowerCase()} link`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            window.prompt("Copy this link", url);
          }
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function IphoneSteps({ button, origin }: { button: QuickButton; origin: string }) {
  const slots = QUICK_SLOTS.filter((s) => gestureFor(button, s));
  return (
    <ol className="kin-quickbtn-steps">
      <li>
        <strong>Sign in to Kin in Safari once.</strong> A Shortcut opens links in Safari rather than the Home Screen icon, and Safari keeps its own sign-in.
      </li>
      <li>
        <strong>Make one shortcut per press.</strong> In the Shortcuts app tap <b>+</b>, add the action <b>Open URLs</b>, paste the link, and name it as shown.
        <a className="btn btn-secondary kin-quickbtn-open" href="shortcuts://create-shortcut">
          <Icon name="external" size={15} /> Open Shortcuts
        </a>
        {slots.map((s) => (
          <div key={s} className="kin-quickbtn-shortcut">
            <div className="kin-quickbtn-shortcut-name">Kin · {QUICK_SLOT_NAMES[s]}</div>
            <CopyLink url={`${origin}/go/${s}`} slot={s} />
          </div>
        ))}
      </li>
      {button === "action" && (
        <li>
          <strong>Action Button:</strong> iPhone Settings → Action Button → swipe to <b>Shortcut</b> → choose <b>Kin · Tap</b>.
        </li>
      )}
      <li>
        <strong>Back Tap:</strong> iPhone Settings → Accessibility → Touch → Back Tap →{" "}
        {button === "action" ? (
          <>
            <b>Double Tap</b> → <b>Kin · Double tap</b>, and <b>Triple Tap</b> → <b>Kin · Long press</b>.
          </>
        ) : (
          <>
            <b>Double Tap</b> → <b>Kin · Tap</b>, and <b>Triple Tap</b> → <b>Kin · Double tap</b>.
          </>
        )}
      </li>
    </ol>
  );
}

function AndroidSteps({ origin }: { origin: string }) {
  return (
    <ol className="kin-quickbtn-steps">
      <li>
        <strong>Touch and hold the Kin icon</strong> on your home screen: <b>Chat with Kin</b>, <b>Talk to Kin</b> and <b>Family chat</b> are in the menu. Drag one out to make it an icon of its own.
      </li>
      <li>
        <strong>Side key (Samsung):</strong> Settings → Advanced features → Side button → <b>Double press</b> → Open app → <b>Kin</b>.
      </li>
      <li>
        <strong>Any other button or launcher</strong> that can open a link: use these, and they follow the choices above.
        {QUICK_SLOTS.map((s) => (
          <div key={s} className="kin-quickbtn-shortcut">
            <div className="kin-quickbtn-shortcut-name">{QUICK_SLOT_NAMES[s]}</div>
            <CopyLink url={`${origin}/go/${s}`} slot={s} />
          </div>
        ))}
      </li>
    </ol>
  );
}
