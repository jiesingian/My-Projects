import Link from "next/link";

/** Says, in place, that Drive-backed photos cannot load until somebody
 * reconnects — and links to the one screen that fixes it.
 *
 * This lives in its own file because it belongs in two panes and was added to
 * one. #59 put it in the Journal's Gallery; Entries renders Drive-backed
 * photos too and got nothing, so a household reading an entry saw bare
 * placeholders with no explanation, which is the exact failure #59 existed to
 * end. Shared markup cannot be added to one caller and forgotten in the other.
 */
export function DriveDisconnectedNotice() {
  return (
    <div className="blueprint" style={{ padding: 10, marginBottom: 14, fontSize: 13 }}>
      <span style={{ color: "var(--color-accent-700)" }}>Google Drive is no longer connected</span> — photos backed up
      there won&apos;t load until you reconnect.{" "}
      <Link href="/settings" style={{ textDecoration: "underline" }}>
        Reconnect in Settings
      </Link>
      .
    </div>
  );
}
