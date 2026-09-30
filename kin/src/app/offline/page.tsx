import { OfflineApp } from "./offline-app";

export const metadata = { title: "Offline · Kin" };

// Static on purpose: the service worker fetches this at install time and
// serves it for every page when there is no connection, and a fallback that
// needs a server to render is not a fallback. It holds no data: everything
// it shows comes from the phone's own copy (lib/offline/store.ts), read in
// the browser, for whoever is signed in.
export const dynamic = "force-static";

/** Offline Kin. Outside the (app) layout, because that layout loads the
 * member and the household from the server, which is exactly the thing that
 * cannot happen right now. */
export default function OfflinePage() {
  return <OfflineApp />;
}
