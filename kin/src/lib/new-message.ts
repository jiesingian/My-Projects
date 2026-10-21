/** Who "New message" offers (Jonathan, 21 October).
 *
 * "New message" on Chat used to open the Connections page, which is codes and
 * requests; the people you could actually message were one screen down. Now
 * it opens a list of them: everyone you are connected with right now, your
 * own household's grown-ups first (connected from the start since #824),
 * then everyone else by name. A former connection, whose old messages are
 * still readable but who can no longer be written to, is not offered.
 *
 * Pure, so the order is tested without a browser. */

export type MessageablePeer = { personId: string; fullName: string; avatarUrl: string | null; householdName: string | null; connected: boolean };

export function messageablePeople<T extends MessageablePeer>(peers: readonly T[], myHouseholdName: string): { household: T[]; others: T[] } {
  const byName = (a: T, b: T) => a.fullName.localeCompare(b.fullName);
  const live = peers.filter((p) => p.connected);
  return {
    household: live.filter((p) => p.householdName === myHouseholdName).sort(byName),
    others: live.filter((p) => p.householdName !== myHouseholdName).sort(byName),
  };
}
