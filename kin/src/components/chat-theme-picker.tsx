"use client";

import { CHAT_THEMES } from "@/lib/chat-themes";

/** The chat's themes, above the composer. Choosing one changes it for
 * everyone in the chat, and the picker says so before anyone taps. */
export function ThemePicker({ current, onPick, onClose }: { current: string; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div className="kin-theme-picker" role="dialog" aria-label="Chat theme">
      <div className="kin-theme-head">
        <span>Chat theme</span>
        <button type="button" className="btn btn-ghost kin-media-close" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="kin-theme-note">Everyone in this chat sees the theme you pick.</p>
      <div className="kin-theme-row">
        {CHAT_THEMES.map((t) => (
          <button key={t.id} type="button" className="kin-theme-chip" aria-pressed={current === t.id} onClick={() => onPick(t.id)}>
            <span className="kin-theme-swatch" style={{ background: t.swatch }} aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
