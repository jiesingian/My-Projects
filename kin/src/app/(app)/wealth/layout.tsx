import { keepKidViewOut } from "@/lib/kid-view";

/** Not for a child in kid view: the tab is hidden, and the address sends
 * them back to Today (K2, 25 September). */
export default async function WealthLayout({ children }: { children: React.ReactNode }) {
  await keepKidViewOut();
  return children;
}
