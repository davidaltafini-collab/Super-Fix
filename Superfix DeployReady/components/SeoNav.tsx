import React from 'react';
import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { isInternalPath, type SeoCrumb, type SeoLink } from '../lib/seo';

/* ============================================================
   Firimiturile și linkurile spre paginile pe meserie și loc (A14).

   Linkuri normale, `<a href>`: pe aici ajunge Google de la un profil la
   paginile lui și de la o pagină la vecinele ei. Omul le folosește la fel:
   „Electrician în București” duce la toți electricienii de acolo.
   ============================================================ */

export const SeoCrumbs: React.FC<{ items?: SeoCrumb[]; className?: string }> = ({ items, className = '' }) => {
  const list = (items || []).filter(item => isInternalPath(item?.path) && item.name);
  if (list.length === 0) return null;

  return (
    <nav aria-label="Firimituri" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-graphite-soft">
        {list.map((item, index) => (
          <li key={item.path} className="inline-flex items-center gap-1.5">
            {index > 0 && <CaretRight size={11} weight="bold" className="text-graphite-soft/60" aria-hidden="true" />}
            {index === list.length - 1 ? (
              <span aria-current="page" className="font-semibold text-graphite">{item.name}</span>
            ) : (
              <Link to={item.path} className="font-semibold transition-colors hover:text-graphite">
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export const SeoLinks: React.FC<{ title: string; links?: SeoLink[]; className?: string }> = ({ title, links, className = '' }) => {
  const list = (links || []).filter(link => isInternalPath(link?.path) && (link.label || link.name));
  if (list.length === 0) return null;

  return (
    <nav aria-label={title} className={className}>
      <h2 className="font-heading text-xl font-medium">{title}</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {list.map(link => (
          <li key={link.path}>
            <Link
              to={link.path}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-graphite/10 bg-white/80 px-4 py-2 text-sm font-semibold text-graphite shadow-clay-sm transition-colors hover:border-super-red/30 hover:text-super-red"
            >
              {link.label || link.name}
              {link.heroes ? <span className="text-xs font-bold text-graphite-soft">{link.heroes}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};
