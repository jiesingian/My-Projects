// English push words (20261026120000): the three pieces of text the database
// writes itself say it in English, and the keys they ride on are unchanged.
export default async function ({ db, check }) {
  await check("The push before 1 November is titled All Saints' Day, body and url as before", async () => {
    const [w] = (await db.query("select * from push_words_undas('2026-10-29'::date, array['Grandma Remedios', 'Grandpa Pedro'], 2)")).rows;
    return (w.title === "All Saints' Day is on Sunday" && w.body.startsWith("Remembering Grandma Remedios, Grandpa Pedro.") && w.url === "/today") || w;
  });
  await check("A new gift draw is called Gift exchange unless named", async () => {
    const [d] = (await db.query("select column_default d from information_schema.columns where table_schema = 'public' and table_name = 'gift_draws' and column_name = 'title'")).rows;
    return d.d.includes("Gift exchange") || d;
  });
  await check("The week's allowance is noted as Weekly allowance", async () => {
    const [f] = (await db.query("select pg_get_functiondef('public.alkansya_pay_allowances()'::regprocedure) src")).rows;
    return (f.src.includes("'Weekly allowance'") && !f.src.includes("baon")) || "old note";
  });
}
