"use client";

import { useRouter } from "next/navigation";

/** Back to wherever the reader came from -- usually the check-up's plan step,
 * which picks up where it was. Opened directly (a shared link, a new tab),
 * there is nothing to go back to, so it goes to the home page instead. */
export function LegalBack() {
  const router = useRouter();
  return (
    <button type="button" className="btn btn-ghost" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
      ← Back
    </button>
  );
}
