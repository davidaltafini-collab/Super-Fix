/* ============================================================
   Căutarea în eroi — același motor ca la misiuni (lib/search.ts), pe alt text.

   Omul nu caută mereu numele exact al eroului. Caută "smart home", "panouri
   solare", un tarif, un oraș, sau chiar numărul de telefon pe care i l-a dat
   cineva. Dacă eroul îl are scris undeva în profil — alias, meserie,
   descriere, puteri, locație, telefon — căutarea trebuie să-l găsească, chiar
   cu o greșeală de scris ("eletrician").
   ============================================================ */

import { Hero } from '../types';
import { fold, scoreTerm, type Hit } from './search';

function haystack(hero: Hero): string {
  return fold(
    [
      hero.alias,
      hero.realName,
      hero.category,
      hero.description,
      hero.powers,
      hero.location,
      hero.phone,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Caută în eroi și îi întoarce ordonați după cât de bine se potrivesc.
 *
 * Fiecare cuvânt căutat trebuie găsit undeva în profil (fuzzy, cu toleranță la
 * greșeli de scris în afară de cifre — un telefon greșit e alt telefon).
 * Un query gol înseamnă "toți", neschimbat.
 */
export function searchHeroes(heroes: Hero[], query: string): Hero[] {
  const terms = fold(query).split(' ').filter(t => t.length > 1);
  if (!terms.length) return heroes;

  const hits: Hit<Hero>[] = [];

  for (const hero of heroes) {
    const whole = haystack(hero);
    const words = whole.split(' ');

    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      const s = scoreTerm(term, words, whole);
      if (s === 0) { matchedAll = false; break; }
      score += s;
    }
    if (!matchedAll) continue;

    hits.push({ item: hero, score });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.map(h => h.item);
}
