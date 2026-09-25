/** Settings is a home list and a page per group. This layout draws nothing;
 * it exists so the actions that change a setting can refresh the whole
 * section at once with revalidatePath("/settings", "layout"). A plain
 * revalidatePath("/settings") only refreshes the home list, so a change made
 * on Appearance or Household would not show on the page it was made on. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
