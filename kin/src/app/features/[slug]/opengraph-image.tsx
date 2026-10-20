import { ImageResponse } from "next/og";
import { FEATURE_PAGES, featurePage } from "@/lib/feature-pages";

/** The picture a feature page shows when its link is pasted into Messenger
 * or Facebook: the page's name and lead on Kin Coral. Drawn once per slug
 * at build time (generateStaticParams), no screenshot in it, so nothing of
 * any household can end up in a preview. */

export const alt = "Kin: Family Life, Decoded";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return FEATURE_PAGES.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = featurePage(slug);
  const heading = page?.heading ?? "Kin";
  const lead = page?.lead ?? "Family Life, Decoded";
  const plan = page?.plan === "plus" ? "KIN PLUS" : "KIN FREE";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #fff5f1 0%, #ffe4da 100%)",
          color: "#2b1a16",
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5, color: "#c0392b" }}>Kin</div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2, color: "#8a3b2f", padding: "8px 18px", borderRadius: 999, background: "rgba(192,57,43,0.10)" }}>{plan}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{heading}</div>
          <div style={{ fontSize: 28, lineHeight: 1.35, color: "#5a3f38", maxWidth: 980 }}>{lead}</div>
        </div>
        <div style={{ fontSize: 24, color: "#8a3b2f" }}>Family Life, Decoded · the app for family life, private to your family</div>
      </div>
    ),
    { ...size },
  );
}
