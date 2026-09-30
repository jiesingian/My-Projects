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
  "20260929060000_connections.sql",
  "20260929090000_family_chat_and_direct_messages.sql",
  "20260929120000_chat_room_photos.sql",
  "20260929160000_chat_room_voice_and_video.sql",
  "20260929161000_chat_room_replies_reactions_mute.sql",
  "20260929162000_chat_groups.sql",
  "20260929163000_child_connections_need_a_parent.sql",
  "20260929170000_voice_note_transcripts.sql",
  "20260930100001_link_thread_reactions.sql",
  "20260930130000_remittance_log.sql",
  "20260930140000_wealth_charts.sql",
  "20260930150100_chat_room_edit_unsend.sql",
  "20260930160000_chat_room_pins.sql",
  "20260930170000_group_seen_by.sql",
  "20260930180000_chat_room_mentions.sql",
  "20260930190000_saved_messages.sql",
  "20260930200000_group_polls.sql",
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
