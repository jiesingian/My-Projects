"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSelectedLayoutSegments } from "next/navigation";
import { Icon } from "@/components/icons";
import { AnimatedSheet } from "@/components/animated-sheet";
import { usePinnedActions } from "@/components/sheet-actions";

/** An add page -- a goal, a journal entry, a holding, a task -- opened from
 * inside the app, shown as a sheet over the page it was opened from
 * (Jonathan, 26 October: adding should be a pop-up, not a trip to another
 * page). The page itself is unchanged and still opens on its own from a
 * link, a bookmark or a reload; this is only the frame @modal puts round it
 * (app/(app)/@modal).
 *
 * Closing is going back: a swipe down, the backdrop, Escape or the ×
 * slides the sheet away and then steps back in history, so the address bar
 * and the phone's own back gesture agree with what is on screen. Saving
 * moves to another page, which empties @modal and takes the sheet with it.
 *
 * A slot keeps what it last showed when the app moves to a page it has no
 * match for, so after saving, @modal still holds the add page. The frame
 * checks the address against the route it is showing and draws nothing
 * once they differ. (The usual fix, a catch-all in @modal, is refused by
 * Next 16's strict route matching for the pages outside (app), such as
 * /login.)
 *
 * The page's own back link is hidden here (.kin-detail-header), and its
 * heading becomes the sheet's title (globals.css, .kin-route-sheet). */
export function RouteSheetFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showing = routeOf(useSelectedLayoutSegments());
  if (showing !== pathname) return null;
  // A fresh sheet for each add page, so one closed earlier never comes back
  // closed.
  return <RouteSheet key={showing}>{children}</RouteSheet>;
}

/** The address of the intercepted page from its segments below the sheets
 * layout: "(.)wealth", "assets", "new" -> /wealth/assets/new. Route groups
 * and the page's own internal segment are not part of an address. */
export function routeOf(segments: string[]): string {
  const parts = segments
    .filter((s) => !s.startsWith("__"))
    .map((s) => s.replace(/^\(\.\)/, ""))
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + parts.join("/");
}

function RouteSheet({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const body = usePinnedActions<HTMLDivElement>();
  const bodyRef = useCallback(
    (el: HTMLDivElement | null) => {
      body(el);
      const stopNaming = nameAfterHeading(el);
      return () => {
        stopNaming?.();
        body(null);
      };
    },
    [body],
  );
  const [open, setOpen] = useState(true);
  const wentBack = useRef(false);
  const back = () => {
    if (wentBack.current) return;
    wentBack.current = true;
    router.back();
  };
  // Vaul reports the end of the slide; this is the net under it, in case
  // the animation never runs (a hidden tab, reduced motion settings).
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(back, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <AnimatedSheet
      open={open}
      onClose={() => setOpen(false)}
      onClosed={back}
      label="Add"
      guardUnsaved
      panelClassName="sheet-panel--full kin-form-sheet kin-route-sheet"
      panelStyle={{ maxHeight: "92dvh" }}
    >
      <div className="kin-route-sheet-top">
        <div className="sheet-grabber" style={{ width: 36, height: 5, borderRadius: 999, background: "var(--color-neutral-400)", margin: "0 auto" }} />
        <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary btn-icon kin-route-sheet-close" aria-label="Close">
          <Icon name="x" size={15} />
        </button>
      </div>
      <div
        ref={bodyRef}
        className="kin-route-sheet-body kin-sheet-scroll"
      >
        {children}
      </div>
    </AnimatedSheet>
  );
}

/** The sheet's name for a screen reader: the page's own heading ("Add a
 * journal entry"), which only arrives with the page, after the loading
 * skeleton. Until then it is "Add". Returns the clean-up, as a React 19
 * callback ref may. */
function nameAfterHeading(body: HTMLElement | null) {
  if (!body) return;
  const panel = body.closest<HTMLElement>('[role="dialog"]');
  if (!panel) return;
  const name = () => {
    const heading = body.querySelector<HTMLElement>("h1, h2, h3");
    if (!heading) return;
    if (!heading.id) heading.id = `route-sheet-title-${Math.random().toString(36).slice(2, 8)}`;
    if (panel.getAttribute("aria-labelledby") === heading.id) return;
    panel.setAttribute("aria-labelledby", heading.id);
    panel.removeAttribute("aria-label");
  };
  name();
  const observer = new MutationObserver(name);
  observer.observe(body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
