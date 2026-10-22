"use client";

import { useEffect, useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import dynamic from "next/dynamic";

const AssistantSheet = dynamic(() => import("@/components/assistant-sheet").then((m) => m.AssistantSheet), { ssr: false });

/** Ask Kin, from anywhere. It rides above the tab bar on every page, the way
 * a help button does elsewhere, instead of taking the top of Today. */
export function AssistantFab({ memberName }: { memberName: string }) {
  const [open, setOpen] = useState(false);
  // Once opened it stays mounted, so closing can animate out.
  const [opened, setOpened] = useState(false);
  const [start, setStart] = useState<"chat" | "voice" | undefined>(undefined);
  const pathname = usePathname();
  const router = useRouter();
  const titleId = useId();

  // ?kin=chat or ?kin=voice is the phone's quick button arriving (see
  // quick-button.ts): open straight into Ask Kin, then drop the parameter so
  // a refresh or Back does not open it again.
  useEffect(() => {
    const url = new URL(window.location.href);
    const kin = url.searchParams.get("kin");
    if (kin !== "chat" && kin !== "voice") return;
    url.searchParams.delete("kin");
    router.replace(url.pathname + url.search, { scroll: false });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after mount
    setStart(kin);
    setOpened(true);
    setOpen(true);
  }, [router]);

  // Ctrl/⌘+K or / (components/keyboard-shortcuts.tsx).
  useEffect(() => {
    const ask = () => {
      setStart(undefined);
      setOpened(true);
      setOpen(true);
    };
    window.addEventListener("kin:ask", ask);
    return () => window.removeEventListener("kin:ask", ask);
  }, []);

  // The family thread has its own composer down there; two things reaching
  // for the same corner is one too many.
  if (pathname.startsWith("/chat")) return null;

  return (
    <>
      <button type="button" onClick={() => { setStart(undefined); setOpened(true); setOpen(true); }} className="kin-fab" aria-haspopup="dialog" aria-expanded={open} aria-label="Ask Kin">
        <Icon name="sparkle" size={22} />
      </button>

      {/* Loaded on first open, not with every page (speed pass, 19 October):
          the sheet library and the console are most of this button's weight. */}
      {opened && <AssistantSheet open={open} onClose={() => setOpen(false)} titleId={titleId} memberName={memberName} start={start} />}
    </>
  );
}
