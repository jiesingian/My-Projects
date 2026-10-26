import { RouteSheetFrame } from "@/components/route-sheet";

/** Every add page in this folder opens in the same sheet. A layout rather
 * than a wrapper in each page, so the sheet is already up and sliding in
 * while the page loads (loading.tsx), and stays the same sheet when it
 * arrives. */
export default function SheetsLayout({ children }: { children: React.ReactNode }) {
  return <RouteSheetFrame>{children}</RouteSheetFrame>;
}
