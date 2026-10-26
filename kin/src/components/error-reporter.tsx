"use client";

import { useEffect } from "react";
import { describeThrown, ERROR_REPORTS_PER_PAGE, isOwnScriptError } from "@/lib/error-capture";

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

/** Listens for what no error boundary sees: window.onerror and unhandled
 * promise rejections. Mounted once, in the root layout. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // A failed <img> or <script> load has no error object and says nothing useful.
      if (!e.error && !e.message) return;
      // An in-app browser's or an extension's own script is not Kin's to fix.
      if (!isOwnScriptError(e.filename, (e.error as Error | undefined)?.stack, window.location.origin)) return;
      reportClientError(e.error ?? e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
