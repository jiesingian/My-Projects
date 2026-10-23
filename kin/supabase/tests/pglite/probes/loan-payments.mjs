// A payment on a loan (20261023220000): the ledger can name the loan it pays
// and the principal part of it; adjust_liability_balance moves a loan's
// balance only in the caller's own household, and never below zero.
const U = (s) => `10000000-0000-0000-0000-0000000000${s}`;
const A = "a0000000-0000-0000-0000-000000000000";
const A_LOAN = "a6000000-0000-0000-0000-000000000001";
const D_LOAN = "d6000000-0000-0000-0000-000000000001";
const JOINT_BDO = "a4000000-0000-0000-0000-000000000001";

export default async function ({ as, check, refused }) {
  const ann = U("a1"), dan = U("d1");
  const pay = (who, principal, sourceTable = "liabilities") =>
    as(who, "insert into wealth_transactions (family_id, account_id, direction, amount, particulars, category, source_table, source_id, principal_amount) values ($1, $2, 'out', 25000, 'Housing loan', 'Debt', $3, $4, $5) returning id", [A, JOINT_BDO, sourceTable, A_LOAN, principal]);
  const balance = async (who, id) => Number((await as(who, "select balance from liabilities where id = $1", [id]))[0]?.balance);

  await check("A loan payment names the loan and its principal", async () => (await pay(ann, 14166.67)).length === 1);
  await check("Principal cannot be more than the payment, below zero, or on anything but a loan", async () =>
    (await refused(() => pay(ann, 25000.01))) === true &&
    (await refused(() => pay(ann, -1))) === true &&
    (await refused(() => pay(ann, 100, "assets"))) === true);
  await check("adjust_liability_balance lowers the household's own loan by the principal", async () => {
    await as(ann, "select public.adjust_liability_balance($1, $2)", [A_LOAN, -14166.67]);
    return (await balance(ann, A_LOAN)) === 1985833.33;
  });
  await check("adjust_liability_balance puts it back when a payment is undone", async () => {
    await as(ann, "select public.adjust_liability_balance($1, $2)", [A_LOAN, 14166.67]);
    return (await balance(ann, A_LOAN)) === 2000000;
  });
  await check("adjust_liability_balance never takes a loan below zero", async () => {
    await as(ann, "select public.adjust_liability_balance($1, $2)", [A_LOAN, -9999999]);
    const zero = (await balance(ann, A_LOAN)) === 0;
    await as(ann, "select public.adjust_liability_balance($1, $2)", [A_LOAN, 2000000]);
    return zero;
  });
  await check("adjust_liability_balance cannot touch another household's loan", async () => {
    const r = await as(ann, "select public.adjust_liability_balance($1, $2) as b", [D_LOAN, -100000]);
    return r[0].b === null && (await balance(dan, D_LOAN)) === 500000;
  });
  await check("Dan cannot move House A's loan either", async () => {
    await as(dan, "select public.adjust_liability_balance($1, $2)", [A_LOAN, -1]);
    return (await balance(ann, A_LOAN)) === 2000000;
  });
}
