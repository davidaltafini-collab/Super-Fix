import React, { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

/* ============================================================
   Mascot — mascota cu umbra ei, pusa dupa ce imaginea e gata.

   `drop-shadow` urmareste conturul real al imaginii, dar numai daca browserul
   are ce urmari in momentul in care calculeaza filtrul. La prima vizita, cand
   PNG-ul nu e inca decodat, umbra se calculeaza pe cutia elementului si iese un
   dreptunghi — iar rezultatul ramane prins in stratul compus, deci nu se
   corecteaza singur. La a doua vizita imaginea vine din cache, e gata inainte de
   prima desenare, si totul arata bine: exact „se intampla doar cand intri prima
   data pe site".

   `complete`/`load` spun doar ca octetii au sosit, nu ca imaginea a fost chiar
   decodata pe GPU — pe telefon diferenta asta e vizibila, mai ales cu conexiuni
   sau device-uri mai lente. `decode()` se rezolva abia cand imaginea chiar poate
   fi pictata, deci umbra n-are cum sa mai prinda o cutie nedecodata.
   ============================================================ */

interface MascotProps {
  /** marimea si pozitia — exact clasele care erau pe `img` */
  className?: string;
  /** utilitarul `drop-shadow-[...]`, pus doar dupa ce imaginea s-a incarcat */
  shadow?: string;
  /** gol = decorativa, deci ascunsa de cititoarele de ecran */
  alt?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
}

export const Mascot: React.FC<MascotProps> = ({ className, shadow, alt = '', fetchPriority }) => {
  const [ready, setReady] = useState(false);

  const attach = useCallback((el: HTMLImageElement | null) => {
    if (!el) return;
    if (typeof el.decode === 'function') {
      el.decode().then(() => setReady(true)).catch(() => setReady(true));
    } else if (el.complete && el.naturalWidth > 0) {
      setReady(true);
    }
  }, []);

  return (
    <img
      ref={attach}
      src="/mascot.png"
      alt={alt}
      aria-hidden={alt ? undefined : true}
      width={377}
      height={712}
      fetchPriority={fetchPriority}
      onLoad={(e) => {
        const el = e.currentTarget;
        if (typeof el.decode === 'function') {
          el.decode().then(() => setReady(true)).catch(() => setReady(true));
        } else {
          setReady(true);
        }
      }}
      className={cn(className, ready && shadow)}
    />
  );
};

export default Mascot;
