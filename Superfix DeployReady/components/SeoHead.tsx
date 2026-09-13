import React from 'react';
import { Helmet } from 'react-helmet-async';
import { DEFAULT_OG_IMAGE, wideOgImage, type SeoOg } from '../lib/seo';

/* ============================================================
   Tagurile din <head> pentru paginile randate pe server (A14).

   Sunt exact cele puse de api/ssr.ts, cu aceleași valori. Ale serverului se
   scot la pornire (`releaseServerHead`), deci pagina randată de Google are un
   singur set, iar cine vine fără JavaScript îl vede pe cel de la server.
   ============================================================ */

interface SeoHeadProps {
  title: string;
  description?: string;
  canonical?: string;
  robots?: string;
  og?: SeoOg & { alt?: string };
  jsonLd?: unknown[];
}

export const SeoHead: React.FC<SeoHeadProps> = ({ title, description, canonical, robots, og, jsonLd }) => {
  const tags: React.ReactElement[] = [];
  if (description) tags.push(<meta key="description" name="description" content={description} />);
  if (robots) tags.push(<meta key="robots" name="robots" content={robots} />);
  if (canonical) tags.push(<link key="canonical" rel="canonical" href={canonical} />);

  if (og) {
    const image = og.image ? wideOgImage(og.image) : { url: DEFAULT_OG_IMAGE, wide: true };
    const properties: [string, string | undefined][] = [
      ['og:site_name', 'Super-Fix'],
      ['og:locale', 'ro_RO'],
      ['og:title', og.title],
      ['og:description', og.description],
      ['og:url', og.url],
      ['og:type', og.type || 'website'],
      ['og:image', image.url],
    ];
    if (image.wide) properties.push(['og:image:width', '1200'], ['og:image:height', '630']);
    properties.push(['og:image:alt', og.alt || og.title]);
    for (const [property, content] of properties) {
      if (content) tags.push(<meta key={property} property={property} content={content} />);
    }
    tags.push(<meta key="twitter:card" name="twitter:card" content="summary_large_image" />);
  }

  (jsonLd || []).forEach((item, index) => {
    // `<` ca escape, ca un `</script>` dintr-o descriere să nu închidă tagul
    tags.push(
      <script key={`ld-${index}`} type="application/ld+json">
        {JSON.stringify(item).replace(/</g, '\\u003c')}
      </script>,
    );
  });

  return (
    <Helmet>
      <title>{title}</title>
      {tags}
    </Helmet>
  );
};
