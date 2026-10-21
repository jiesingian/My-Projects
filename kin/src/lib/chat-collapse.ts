/** Folds a run of unsent messages into one line.
 *
 * Every unsent message stays in the thread as "Message removed", which is
 * right for one: the gap says something was there. Ten in a row (someone
 * tidying a wrong-chat spree, or the tests' leftovers in the QA household)
 * read as a wall of tombstones that pushes real messages off the screen. A
 * run of two or more becomes a single "N messages removed" row; a lone one is
 * left exactly as it was (21 October audit).
 *
 * Pure, so the household thread and the group thread fold the same way and
 * the rule is tested without a browser. */
export type CollapsedRow<T> = { kind: "one"; m: T } | { kind: "removed"; count: number; first: T; last: T };

export function collapseRemoved<T>(messages: readonly T[], isRemoved: (m: T) => boolean): CollapsedRow<T>[] {
  const out: CollapsedRow<T>[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (!isRemoved(m)) {
      out.push({ kind: "one", m });
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < messages.length && isRemoved(messages[j + 1])) j++;
    const count = j - i + 1;
    if (count === 1) out.push({ kind: "one", m });
    else out.push({ kind: "removed", count, first: m, last: messages[j] });
    i = j + 1;
  }
  return out;
}

export function removedRunLabel(count: number): string {
  return `${count} messages removed`;
}
