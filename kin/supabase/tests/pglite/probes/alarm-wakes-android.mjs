const SECRET = "pglite-cron-secret-0123456789abcdef0123456789";
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const M = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const B = "b0000000-0000-0000-0000-000000000000";
const APPLE = (c) => `https://api.push.apple.com/3/device/${c.repeat(64)}`;
const ANDROID = (c) => `https://fcm.googleapis.com/kin-android/${c.repeat(3)}:APA91b${"x".repeat(40)}`;
// The daily alarm re-sync reaches the Android app too (20261030153700): its
// Firebase token (auth 'fcm') is picked beside the iPhone's alert token; a
// browser's Web Push -- Chrome's lives on fcm.googleapis.com too -- and the
// iPhone's VoIP token never are.
export default async function ({ db, as, check }) {
  // A change is stamped with the real clock (alarm_wake_mark: now()), and a
  // tick only takes changes made before it. The ticks below are fixed dates,
  // so a change queued during the test counts as made before the tick it is
  // asked at; else the probe failed once the real clock passed those dates
  // (29 October, 23:05 UTC).
  const run = async (at, secret = SECRET) => {
    await db.query("update alarm_wake_queue set changed_at = $1 where changed_at > $1", [at]);
    return (await db.query("select * from due_alarm_wakes($1, $2)", [secret, at])).rows;
  };
  const who = (rows) => rows.map((r) => `${r.auth}:${r.endpoint.slice(-3)}:${r.reason}`).sort().join("|");

  // Ann has an iPhone (alert + voip), an Android phone, and Chrome; Kid has
  // an Android phone; Ben in House B has an Android phone.
  await db.exec("delete from push_subscriptions; delete from alarm_wake_queue; delete from reminder_sends");
  await db.query(
    `insert into push_subscriptions (member_id, family_id, endpoint, p256dh, auth) values
      ($1, $4, $5, 'kin-native', 'alert'), ($1, $4, $6, 'kin-native', 'voip'), ($1, $4, $7, 'kin-native', 'fcm'),
      ($1, $4, 'https://fcm.googleapis.com/fcm/send/chrome-ann', 'BNc', 'x'),
      ($2, $4, $8, 'kin-native', 'fcm'), ($3, $9, $10, 'kin-native', 'fcm')`,
    [M("a1"), M("a2"), M("b1"), A, APPLE("a"), APPLE("v"), ANDROID("n") + "ann", ANDROID("k") + "kid", B, ANDROID("b") + "ben"],
  );

  await check("A wrong secret gets nothing", async () => (await run("2026-10-29 20:00+00", "nope")).length === 0);
  await check("From 03:00 Manila: the iPhone and each Android phone once; never VoIP or a browser", async () => {
    const r = await run("2026-10-29 19:05+00");
    return who(r) === "alert:aaa:daily|fcm:ann:daily|fcm:ben:daily|fcm:kid:daily" || who(r);
  });
  await check("Not twice the same day", async () => (await run("2026-10-29 23:00+00")).length === 0);
  await check("A medicine changed in House A wakes its phones, Android too, and not Ben's", async () => {
    await as(U("a1"), "insert into health_medicines (family_id, member_id, name, times, start_date, visibility) values ($1, $2, 'Losartan', '{08:00}', '2026-10-01', 'family')", [A, M("a1")]);
    // The change is stamped with the real time; pin it before the probe's
    // frozen clock, or the check fails on any day after 29 October.
    await db.exec("update alarm_wake_queue set changed_at = '2026-10-29 23:00+00'");
    const r = await run("2026-10-29 23:05+00");
    return who(r) === "alert:aaa:changed|fcm:ann:changed|fcm:kid:changed" || who(r);
  });
  await check("Someone signed in still can't ask for the wakes", async () => (await as(U("a1"), "select * from due_alarm_wakes('guess', now())")).length === 0);
}
