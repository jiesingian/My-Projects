import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURE_PAGES, featurePage, featurePlanLine } from "@/lib/feature-pages";
import { SITE_URL } from "@/lib/site";

/** One public feature page (lib/feature-pages.ts holds the words and the
 * screenshots): what it is in plain English, how Kin does it, three real
 * screenshots of the sample household, the free or Plus line, a few
 * questions, and Start with Kin. Static for each slug; nothing here reads
 * a session or a database. */

export const dynamicParams = false;

export function generateStaticParams() {
  return FEATURE_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = featurePage(slug);
  if (!page) return {};
  const url = `${SITE_URL}/features/${page.slug}`;
  return {
    title: `${page.title} · Kin`,
    description: page.description,
    alternates: { canonical: url },
    openGraph: { title: page.title, description: page.description, url, type: "article", siteName: "Kin", locale: "en_PH" },
    twitter: { card: "summary_large_image", title: page.title, description: page.description },
  };
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = featurePage(slug);
  if (!page) notFound();
  const related = page.related.map(featurePage).filter((p): p is NonNullable<typeof p> => !!p);

  return (
    <>
      <p className="kin-eyebrow">{page.eyebrow}</p>
      <h1>{page.heading}</h1>
      <p className="kin-feature-lead">{page.lead}</p>
      <p>
        <Link href="/" className="btn btn-primary kin-feature-cta">
          Start with Kin
        </Link>
      </p>

      {page.intro.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <h2>How it works in Kin</h2>
      <ul className="kin-feature-how">
        {page.how.map((h) => (
          <li key={h.title}>
            <strong>{h.title}.</strong> {h.line}
          </li>
        ))}
      </ul>

      <h2>What it looks like</h2>
      <ul className="kin-feature-shots" aria-label={`Screens of ${page.name} in Kin`}>
        {page.shots.map((s, i) => (
          <li key={s.src}>
            <figure>
              {/* The first is in view on a phone; the rest wait their turn. */}
              <img src={s.src} alt={s.alt} width={390} height={844} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
              <figcaption>{s.caption}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <p className="kin-feature-note">Screens from Kin’s sample household. Your family’s records are private to your family: each household is walled off from every other, nothing is sold, and Kin AI’s provider does not train on your records.</p>

      <h2>Free or Plus?</h2>
      <p className="kin-feature-plan" data-plan={page.plan}>
        {page.plan === "free" ? <span className="kin-feature-badge">KIN FREE</span> : <span className="kin-feature-badge kin-plus-badge">PLUS</span>} {featurePlanLine(page.plan)}
      </p>

      <h2>Questions people ask</h2>
      <dl className="kin-feature-faq">
        {page.questions.map((q) => (
          <div key={q.q}>
            <dt>{q.q}</dt>
            <dd>{q.a}</dd>
          </div>
        ))}
      </dl>

      <div className="kin-feature-end">
        <h2>Start with Kin</h2>
        <p>Take the one-minute family check-up, then set up your family. Everything stays private to your household.</p>
        <p>
          <Link href="/" className="btn btn-primary kin-feature-cta">
            Start with Kin
          </Link>
        </p>
        {related.length > 0 && (
          <p className="kin-feature-related">
            Also in Kin:{" "}
            {related.map((r, i) => (
              <span key={r.slug}>
                {i > 0 && " · "}
                <Link href={`/features/${r.slug}`}>{r.name}</Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </>
  );
}
