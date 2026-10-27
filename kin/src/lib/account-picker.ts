/** The account pickers, in one place.
 *
 * Every form that moves money (Move money, Pay a bill, Add goal, a task's
 * usual cost, a remittance, the basket, a scanned receipt) listed every
 * account it could in one flat <select>, in the order they were created, ₱0
 * ones included. A household with BPI, BDO, GCash, Maya and the children's
 * accounts was scrolling a list of twelve to find the one it uses every day
 * (21 October audit). Two rules fix that, both pure so they are tested
 * without a browser:
 *
 * - `toPickable` is the one filter-and-map that nine pages used to copy by
 *   hand: joint accounts and the viewer's own, with the fields a picker
 *   shows, plus how often the account has been used.
 * - `accountPickerGroups` orders the most-used first and, once there are
 *   more than a handful, splits them into Joint, Mine and "Not used yet"
 *   (a ₱0 account nothing has moved through), so the everyday accounts are
 *   at the top and the empty ones are out of the way without being hidden. */

export type PickableAccount = {
  id: string;
  name: string;
  institution?: string | null;
  linked_app_url: string | null;
  balance: number;
  is_joint: boolean;
  account_type?: string | null;
  /** Every movement ever recorded on it, pending included. */
  movementCount?: number;
  /** An Only-you account: the viewer's own, private, shared with nobody.
   * An entry moved into one is seen by nobody else (27 October). */
  onlyMe?: boolean;
  /** Whose it is, when it is someone else's own account: the list files it
   * under their name (Janine, 27 October: a goal funded from Jonathan's). */
  ownerName?: string;
};

/** What `loadAccounts` returns, as far as a picker needs. */
export type PickableSource = {
  id: string;
  name: string;
  institution: string | null;
  linked_app_url: string | null;
  balance: number;
  is_joint: boolean;
  account_type: string;
  owner_member_id: string | null;
  movementCount: number;
  is_private?: boolean | null;
  /** Named on account_viewers: private, but opened to someone. */
  shared?: boolean;
};

/** Joint accounts and the viewer's own, the way every money form offers
 * them; `everyone` keeps every account the viewer can see (Move money and
 * the receipt scanner, where a transfer into a shared-with-you account is
 * allowed and the database decides the rest). */
export function toPickable(
  accounts: readonly PickableSource[],
  memberId: string,
  opts: { everyone?: boolean; owners?: ReadonlyMap<string, string> } = {},
): PickableAccount[] {
  return accounts
    .filter((a) => opts.everyone || a.is_joint || a.owner_member_id === memberId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      linked_app_url: a.linked_app_url,
      balance: a.balance,
      is_joint: a.is_joint,
      account_type: a.account_type,
      movementCount: a.movementCount,
      onlyMe: !a.is_joint && !!a.is_private && !a.shared && a.owner_member_id === memberId,
      ...(opts.owners && !a.is_joint && a.owner_member_id && a.owner_member_id !== memberId ? { ownerName: opts.owners.get(a.owner_member_id) ?? "Someone else" } : {}),
    }));
}

export type AccountGroup<T> = { label: string | null; accounts: T[] };

/** Up to this many accounts, one plain list: groups on a short list are
 * headings with one row under each, which is noise. */
export const FLAT_UP_TO = 3;

/** Most used first, then by name; `<option>` order is what the thumb lands
 * on, and the first option is what every form picks by default. */
export function sortByUse<T extends Pick<PickableAccount, "name" | "movementCount">>(accounts: readonly T[]): T[] {
  return [...accounts].sort((a, b) => (b.movementCount ?? 0) - (a.movementCount ?? 0) || a.name.localeCompare(b.name));
}

/** An account nothing has moved through and nothing sits in: real, but not
 * the one being paid from today. */
export function isUnused<T extends Pick<PickableAccount, "balance" | "movementCount">>(a: T): boolean {
  return a.balance === 0 && (a.movementCount ?? 0) === 0;
}

export function accountPickerGroups<T extends Pick<PickableAccount, "name" | "balance" | "is_joint" | "movementCount" | "ownerName">>(accounts: readonly T[]): AccountGroup<T>[] {
  const sorted = sortByUse(accounts);
  // Someone else's accounts always sit under their name, however short the
  // list: without it, Jonathan's BPI and yours read the same.
  const others = sorted.filter((a) => a.ownerName);
  if (sorted.length <= FLAT_UP_TO && !others.length) return sorted.length ? [{ label: null, accounts: sorted }] : [];
  const own = sorted.filter((a) => !a.ownerName);
  const unused = own.filter(isUnused);
  const live = own.filter((a) => !isUnused(a));
  const joint = live.filter((a) => a.is_joint);
  const mine = live.filter((a) => !a.is_joint);
  const byOwner = new Map<string, T[]>();
  for (const a of others) byOwner.set(a.ownerName!, [...(byOwner.get(a.ownerName!) ?? []), a]);
  const groups: AccountGroup<T>[] = [];
  // Joint and Mine are headings only when both exist; one of them alone is
  // just "the accounts", and a heading over all of them says nothing --
  // unless someone else's follow, when it needs a name of its own.
  if ((joint.length && mine.length) || others.length) {
    if (joint.length) groups.push({ label: "Joint", accounts: joint });
    if (mine.length) groups.push({ label: "Mine", accounts: mine });
  } else if (live.length) {
    groups.push({ label: unused.length ? "In use" : null, accounts: live });
  }
  for (const [name, list] of byOwner) groups.push({ label: `${name}\u2019s`, accounts: list });
  if (unused.length) groups.push({ label: "Not used yet", accounts: unused });
  return groups;
}
