"use client";

import { useEffect } from "react";
import { describeThrown, ERROR_REPORTS_PER_PAGE, isOwnScriptError, isStaleBuild } from "@/lib/error-capture";

const sent = new Set<string>();

/** Sends one error the browser caught to /api/errors: the page's path, the
 * message and the stack, nothing else; the server scrubs and fingerprints
 * it (lib/error-capture.ts). The same message once per page load, and at
 * most a handful, so a render loop cannot flood anything. */
export function reportClientError(thrown: unknown) {
  try {
    const { message, stack } = describeThrown(thrown);
    if (!message || sent.has(message) || sent.size >= ERROR_REPORTS_PER_PAGE) return;
    sent.add(message);
    const body = JSON.stringify({ route: window.location.pathname, message: message.slice(0, 1000), stack: stack.slice(0, 4000) });
    if (navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/errors", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}

/** A page from before the latest deploy that asked for a file the deploy
 * removed (isStaleBuild): loads the page again, once, which fetches the new
 * build. True when it is reloading. Not again within a minute, so a chunk
 * that is really missing cannot loop; that one is reported as before. */
export function reloadForNewBuild(thrown: unknown): boolean {
  try {
    if (!isStaleBuild(describeThrown(thrown).message)) return false;
    const last = Number(sessionStorage.getItem("kin-new-build-reload") ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem("kin-new-build-reload", String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/** Listens for what no error boundary sees: window.onerror and unhandled
 * promise rejections. Mounted once, in the root layout. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // A failed <img> or <script> load has no error object and says nothing useful.
      if (!e.error && !e.message) return;
      // An in-app browser's or an extension's own script is not Kin's to fix.
      if (!isOwnScriptError(e.filename, (e.error as Error | undefined)?.stack, window.location.origin)) return;
      if (reloadForNewBuild(e.error ?? e.message)) return;
      reportClientError(e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (reloadForNewBuild(e.reason)) return;
      reportClientError(e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
