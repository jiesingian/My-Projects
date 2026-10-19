/** Every foreign key on the tables added 14-19 October has an index that
 * starts with its columns -- the advisor's unindexed_foreign_keys, as a probe,
 * so a new column on one of these tables cannot quietly bring it back. */
const TABLES = [
  "event_rsvps", "event_comments", "health_medicine_alerts", "health_medicine_supply", "health_medicine_photos",
  "list_add_tokens", "tree_person_stories", "tree_person_story_files", "loyalty_cards",
  "vault_emergency_contacts", "vault_emergency_requests", "vault_emergency_opens", "household_helpers",
  "alkansya_plans", "alkansya_entries", "utang_entries", "utang_payments",
  "paluwagan_groups", "paluwagan_members", "paluwagan_payments",
];

export default async function ({ db, check }) {
  const { rows } = await db.query(
    `select c.conrelid::regclass::text as tbl, c.conname
       from pg_constraint c
      where c.contype = 'f'
        and c.conrelid::regclass::text = any($1)
        and not exists (
          select 1 from pg_index i
           where i.indrelid = c.conrelid
             and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
        )`,
    [TABLES],
  );
  await check(`This week's foreign keys all have a covering index${rows.length ? ` (missing: ${rows.map((r) => `${r.tbl}.${r.conname}`).join(", ")})` : ""}`, async () => rows.length === 0);
}
