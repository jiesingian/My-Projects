/** Every row a query matches, a page at a time. The API answers at most 1000
 * rows a request (Supabase's max rows), so a plain select over a month of an
 * imported statement, or an account's whole history, silently stopped there.
 * `page(from, to)` is the query with `.order(...)` and `.range(from, to)`; an
 * error ends the read with what came so far, as the single select did. */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < size) break;
  }
  return rows;
}
