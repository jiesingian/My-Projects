import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { paletteById } from "@/lib/palettes";
import { ThemeControl, PaletteControl, TextSizeControl } from "@/components/settings-controls";

/** Theme, colours and text size -- the Appearance group of the old single
 * Settings page, on a page of its own. */
export default async function AppearanceSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Appearance" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Theme</div>
        <ThemeControl current={me.theme} forcedDark={Boolean(paletteById(me.palette).darkOnly)} />
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Colours</div>
        <PaletteControl current={me.palette ?? "classic"} />
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Text size</div>
        <TextSizeControl current={me.text_scale} />
      </div>
    </div>
  );
}
