// Row-level security checks for the chat and connection migrations, run in
// PGlite (Postgres compiled to WebAssembly) -- no database, no credentials,
// no real data. `npm run test:rls` from kin/.
//
// base.sql is a small stand-in for the parts of the real schema these
// migrations lean on (auth.uid(), people, families, members, family_links,
// storage.objects, ...) with five made-up households. The migrations
// themselves are the real files from supabase/migrations, applied in order
// -- twice, so a file that cannot re-run fails here. Each probe file then
// runs against a fresh database of its own.
//
// Add a probe: a file in probes/ exporting `default async ({ db, as, check,
// refused })`. `as(userId, sql, params)` runs a query as that signed-in user;
// `check(label, fn)` passes when fn returns true; `refused(fn, text?)` is
// true when fn throws (and, given text, the error mentions it).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "..", "migrations");

// The migrations these probes cover, in the order they ran on main.
const MIGRATIONS = [
  "20260923160000_tree_shared_relatives.sql",
  "20260929060000_connections.sql",
  "20260929090000_family_chat_and_direct_messages.sql",
  "20260929120000_chat_room_photos.sql",
  "20260929160000_chat_room_voice_and_video.sql",
  "20260929161000_chat_room_replies_reactions_mute.sql",
  "20260929162000_chat_groups.sql",
  "20260929163000_child_connections_need_a_parent.sql",
  "20260929170000_voice_note_transcripts.sql",
  "20260930100000_member_card_and_sos.sql",
  "20260930100001_link_thread_reactions.sql",
  "20260930130000_remittance_log.sql",
  "20260930140000_wealth_charts.sql",
  "20260930150100_chat_room_edit_unsend.sql",
  "20260930160000_chat_room_pins.sql",
  "20260930171000_household_special_days.sql",
  "20261002090000_wealth_include_private_in_totals.sql",
  "20261002100000_account_numbers.sql",
  "20261006100000_group_seen_by.sql",
  "20261006100100_chat_room_mentions.sql",
  "20261006100200_saved_messages.sql",
  "20261006100300_group_polls.sql",
  "20261006100400_scheduled_messages.sql",
  "20261006100500_journal_entry_videos.sql",
  "20261006120000_tree_match_suggestions.sql",
  "20261011100000_tree_offer_limits_blocks_accounts.sql",
  "20261007090000_time_capsule_letters.sql",
  "20261007110000_household_time_zone.sql",
  "20261007140000_reminders_follow_household_zone.sql",
  "20261007160000_location_pause_and_places.sql",
  "20261007170000_bill_reminder_days.sql",
  "20261008090000_cheaper_chat_unread.sql",
  "20261008100000_buy_item_meals.sql",
  "20260922053456_rewards_and_redemption.sql",
  "20261008110000_points_children_cannot_award.sql",
  "20261008110100_household_streak_bonus.sql",
  "20261009090000_time_capsules_recipient_only.sql",
  "20261009090100_journal_letters.sql",
  "20261009090200_letter_cards.sql",
  "20261012090000_open_when_letters.sql",
  "20261012090100_letter_replies.sql",
  "20261012190000_asset_breakdown.sql",
  "20261012210000_joint_accounts_grownups_only.sql",
  "20261012150000_buy_items_for_event.sql",
  "20261013160000_start_here_bonus.sql",
  "20261013170000_goal_visibility.sql",
  "20261013171000_goal_points.sql",
  "20261013180000_try_every_page_bonus.sql",
  "20261013190000_account_viewers.sql",
  "20261013200000_families_chosen_plan.sql",
  "20261014090000_event_rsvps.sql",
  "20261014100000_event_comments.sql",
  "20261014200000_missed_dose_alerts.sql",
  "20261014201000_medicine_supply.sql",
  "20261014202000_list_add_link.sql",
  "20261014204000_tree_person_stories.sql",
  "20261015090000_loyalty_cards.sql",
  "20261015120000_vault_emergency_access.sql",
  "20261015121000_household_helpers.sql",
  "20261015130000_medicine_prescription_photos.sql",
  "20261019090000_helper_family_plans.sql",
  "20261019090001_reminders_follow_repeating_tasks.sql",
  "20261019100000_alkansya.sql",
  "20261019110000_utang_paluwagan.sql",
  "20261019120000_statement_import.sql",
  "20261019140000_this_weeks_fk_indexes.sql",
  "20261019152700_recipe_tree_person.sql",
  "20261019153000_shared_costs.sql",
  "20261019211500_tree_stories_shared.sql",
  "20261019212500_buy_list_live_and_helper_push.sql",
  "20261019233000_remembrance_undas.sql",
  "20261019233100_event_potluck.sql",
  "20261019233200_gift_draw.sql",
  "20261019233300_gift_list.sql",
  "20261020001000_money_recap_push.sql",
  "20261020002000_visit_questions.sql",
  "20261020090000_gift_draw_date_holds_after_draw.sql",
  "20261020090100_health_photo_files_follow_their_row.sql",
  "20261020090200_medicine_times_hhmm.sql",
  "20261020090300_reminders_done_plans_refills_spring_forward.sql",
  "20261020090400_money_recap_key_needs_device.sql",
  "20261020090500_alkansya_reactivation_keeps_paid_day.sql",
  "20261020120000_goals_game.sql",
  "20261020150000_goals_game_steps.sql",
  "20261020160000_helper_refill_lines.sql",
  "20261020180000_delete_household_forgets_health_photos.sql",
  "20261020190000_goals_family_pack.sql",
  "20261020210000_push_test_rows.sql",
  "20261020212000_christmas_on_today.sql",
  "20261020230000_send_to_kin.sql",
  "20261020231000_event_guest_links.sql",
  "20261020232000_invite_a_family.sql",
  "20261020235000_vault_emergency_same_household.sql",
  "20261021000500_managed_children_count.sql",
  "20261021010000_app_errors.sql",
  "20261021020000_delete_my_account.sql",
  "20261021030000_goals_drive_targets.sql",
  "20261021040000_household_grownups_connected.sql",
  "20261021130000_push_targets_per_push.sql",
  "20261021140000_journal_public_tree_linked.sql",
  "20261022010000_journal_public_grownups_only.sql",
  "20261022090000_account_deletion_leaves_nothing.sql",
  "20261022110000_account_deletion_shared_private.sql",
  "20261022120000_household_delete_sweeps_person_files.sql",
  "20261022150000_accounts_deleted_at.sql",
  "20261022160000_last_grownup_takes_household.sql",
  "20261022170000_income_groups.sql",
  "20261022180000_utang_instalments.sql",
  "20261022190000_dose_reminder_repeats.sql",
  "20261023100000_buy_items_store.sql",
  "20261023120000_entry_owner.sql",
  "20261023140000_badges_straight_away.sql",
  "20261023200000_buy_items_budget.sql",
  "20261023210000_buy_trips.sql",
  "20261023220000_loan_payments.sql",
  "20261023230000_occasion_pushes_anniversaries_feb29.sql",
  "20261023231000_loan_asset_link.sql",
  "20261023232000_asset_purchases.sql",
  "20261023235000_pushes_skip_scheduled_bills_allday_plans.sql",
  "20261023237000_dose_alarm_link.sql",
  "20261026100000_spending_budgets.sql",
  "20261026110000_household_budget_to_family.sql",
  "20261026120000_english_push_words.sql",
  "20261026130000_bill_account.sql",
  "20261026140000_market_category.sql",
  "20261026150000_bill_for_loan_asset_goal.sql",
  "20261026170000_loan_terms.sql",
  "20261026180000_child_goals.sql",
  "20261026190000_goal_from_account_start.sql",
  "20261027120000_net_worth_daily_snapshots.sql",
  "20261027130000_goal_second_source.sql",
  "20261027140000_credit_card_due.sql",
  "20261027160000_delete_empty_doc_folder.sql",
  "20261027170000_account_qr_codes.sql",
];

const only = process.argv[2];
const probeFiles = fs
  .readdirSync(path.join(here, "probes"))
  .filter((f) => f.endsWith(".mjs") && (!only || f.includes(only)))
  .sort();

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(here, "base.sql"), "utf8"));
  for (const pass of [1, 2]) {
    for (const m of MIGRATIONS) {
      try {
        await db.exec(fs.readFileSync(path.join(migrationsDir, m), "utf8"));
      } catch (e) {
        throw new Error(`${m} failed on pass ${pass}: ${e.message}`);
      }
    }
  }
  return db;
}

let pass = 0;
let fail = 0;
for (const file of probeFiles) {
  console.log(`\n${file}`);
  const db = await freshDatabase();
  const as = async (who, sql, params = []) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: who, role: "authenticated" })]);
    await db.exec("set role authenticated");
    try {
      return (await db.query(sql, params)).rows;
    } finally {
      await db.exec("reset role");
    }
  };
  const check = async (label, fn) => {
    try {
      const r = await fn();
      if (r === true) {
        pass++;
        console.log("  ok   ", label);
      } else {
        fail++;
        console.log("  FAIL ", label, JSON.stringify(r));
      }
    } catch (e) {
      fail++;
      console.log("  FAIL ", label, e.message);
    }
  };
  const refused = async (fn, match) => {
    try {
      await fn();
      return "was allowed";
    } catch (e) {
      return match ? e.message.includes(match) || e.message : true;
    }
  };
  const probe = await import(path.join(here, "probes", file));
  await probe.default({ db, as, check, refused });
  await db.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
