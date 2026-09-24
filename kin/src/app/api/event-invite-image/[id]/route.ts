import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { fetchLinkPreview, fetchPreviewImage } from "@/lib/link-preview";

/** The thumbnail on an event's invitation card, fetched by Kin's server so the
 * member's browser never contacts the invitation's site at all. Loaded
 * directly, that image would hand every member's IP address to whoever
 * controls the page, every time the Planner opened -- see parseOpenGraph.
 *
 * Asked for by event id, never by URL: the only image this will fetch is the
 * one named by the page already saved on an event in the caller's own
 * household. Given a URL it would be an open proxy for anyone signed in.
 *
 * What it serves is held to a raster type from a short list (fetchPreviewImage
 * reads the type itself rather than passing on what the site claimed), with
 * nosniff so the browser can't decide otherwise, and a sandboxing CSP in case
 * the response is ever opened directly in a tab. SVG is refused outright:
 * served from Kin's origin, an SVG opened on its own runs its scripts here. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("invite_url").eq("id", id).eq("family_id", me.family_id).maybeSingle();
  if (!event?.invite_url) return new Response("Not found", { status: 404 });

  const preview = await fetchLinkPreview(event.invite_url);
  if (!preview?.image) return new Response("Not found", { status: 404 });

  const image = await fetchPreviewImage(preview.image);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(image.bytes as BodyInit, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
