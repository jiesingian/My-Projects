#!/usr/bin/env node
// "Errors this week" for the weekly check (weekly-check.yml).
//
// Signs in to dev and to production as the QA account each one uses (the
// same secrets the Schema step reads) and asks public.app_error_digest for
// the most frequent error fingerprints of the last 7 days. The table holds
// no personal data (supabase/migrations/20261021010000_app_errors.sql), and
// only those two accounts may read the digest.
//
// Writes Markdown to the file named by the first argument (default
// /tmp/errors.md) and prints `prod_count=<n>` to $GITHUB_OUTPUT when set.
// Never fails the job: a database without the function yet, or a missing
// secret, is a line in the report, not a red check.
//
// Usage (from kin/): node scripts/error-digest.mjs /tmp/errors.md
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const out = process.argv[2] || "/tmp/errors.md";
const env = process.env;

const targets = [
  { name: "Production", url: env.PROD_SUPABASE_URL, key: env.PROD_SUPABASE_ANON_KEY, email: env.PROD_E2E_EMAIL, password: env.PROD_E2E_PASSWORD },
  { name: "Dev", url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, email: env.E2E_EMAIL, password: env.E2E_PASSWORD },
];

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 160);

async function digest(t) {
  if (!t.url || !t.key || !t.email || !t.password) return { note: "its secrets are not set here." };
  const supabase = createClient(t.url, t.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: t.email, password: t.password });
  if (signInError) return { note: `could not sign in (${signInError.message}).` };
  const { data, error } = await supabase.rpc("app_error_digest", { p_days: 7 });
  await supabase.auth.signOut().catch(() => {});
  if (error) return { note: `the digest could not be read (${error.message}).` };
  return { rows: data ?? [] };
}

const lines = ["## Errors this week", ""];
let prodCount = 0;
for (const t of targets) {
  const r = await digest(t);
  lines.push(`### ${t.name}`, "");
  if (r.note) {
    lines.push(`Not read: ${r.note}`, "");
    continue;
  }
  const total = r.rows.reduce((n, e) => n + e.count, 0);
  if (t.name === "Production") prodCount = total;
  if (r.rows.length === 0) {
    lines.push("None recorded in the last 7 days.", "");
    continue;
  }
  lines.push(`${total} error${total === 1 ? "" : "s"} across ${r.rows.length} fingerprint${r.rows.length === 1 ? "" : "s"} (top 25, most frequent first).`, "");
  lines.push("| Count | Where | Message | Version | Last seen | Fingerprint |", "| ---: | --- | --- | --- | --- | --- |");
  for (const e of r.rows) {
    lines.push(`| ${e.count} | ${e.kind} \`${cell(e.route)}\` | ${cell(e.message)} | ${cell(e.app_version)} | ${String(e.last_seen).slice(0, 16).replace("T", " ")} UTC | \`${e.fingerprint}\` |`);
  }
  lines.push("");
}

fs.writeFileSync(out, lines.join("\n") + "\n");
if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `prod_count=${prodCount}\n`);
console.log(lines.join("\n"));
