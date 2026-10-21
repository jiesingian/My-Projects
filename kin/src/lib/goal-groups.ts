/** Planner → Goals as collapsible groups (Janine, 21 October): one per
 * person -- the viewer first, then the household's order -- and the whole
 * household's goals last. Nobody with no goals has a group. */
export function goalGroups<G extends { ownerId: string | null }>(
  goals: G[],
  people: { id: string; name: string }[],
  meId: string,
): { key: string; label: string; goals: G[] }[] {
  const order = [meId, ...people.map((p) => p.id).filter((id) => id !== meId)];
  const owners = [...new Set(goals.map((g) => g.ownerId).filter((o): o is string => o !== null))];
  owners.sort((a, b) => (order.indexOf(a) === -1 ? Infinity : order.indexOf(a)) - (order.indexOf(b) === -1 ? Infinity : order.indexOf(b)));
  const groups = owners.map((id) => ({
    key: id,
    label: id === meId ? "You" : (people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone"),
    goals: goals.filter((g) => g.ownerId === id),
  }));
  const family = goals.filter((g) => g.ownerId === null);
  return family.length > 0 ? [...groups, { key: "family", label: "Whole family", goals: family }] : groups;
}
