import { keepKidViewOut } from "@/lib/kid-view";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { PlusNote } from "@/components/plus";

/** Not for a child in kid view: the tab is hidden, and the address sends
 * them back to Today (K2, 25 September).
 *
 * Wealth is Kin Plus. On Kin Free every page here still opens, with a note on
 * top; the database refuses a new account, bill or entry. */
export default async function WealthLayout({ children }: { children: React.ReactNode }) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (me && !readAccess(me.families).plus) {
    return (
      <>
        <div style={{ padding: "0.75rem var(--gutter) 0" }}>
          <PlusNote area="Wealth" />
        </div>
        {children}
      </>
    );
  }
  return children;
}
