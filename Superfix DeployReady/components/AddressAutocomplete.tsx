import React, { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from '@phosphor-icons/react';

import { suggestAddresses, AddressSuggestion } from '../lib/geo';

import './address-autocomplete.css';

/* ============================================================
   Câmpul de adresă care propune, ca la căutarea de pe hartă.

   Până acum era un câmp de text gol: omul scria „str republicii 12", iar
   geocodarea încerca abia la ieșirea din câmp să ghicească din ce oraș. Când
   nimerea altă localitate cu aceeași stradă — și în România sunt zeci — nimeni
   nu afla, fiindcă adresa scrisă rămânea cea scrisă.

   Acum alege dintr-o listă. Ce alege vine cu coordonate exacte, deci pinul de pe
   hartă nu mai e o presupunere.

   Sursa e Photon, nu Nominatim; motivul stă în `lib/geo.ts`, lângă funcție.
   ============================================================ */

interface Props {
  id: string;
  value: string;
  onChange: (text: string) => void;
  /** a ales din listă: vine cu text ȘI cu coordonate */
  onPick: (picked: AddressSuggestion) => void;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}

export const AddressAutocomplete: React.FC<Props> = ({
  id, value, onChange, onPick, onBlur, invalid, describedBy, placeholder,
}) => {
  const listId = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  /* Textul pus de noi în câmp nu trebuie să pornească o nouă căutare: altfel,
     imediat ce omul alege „Strada Republicii 12, Timișoara", cererea pleacă
     iar cu exact acel text și lista se redeschide peste ce tocmai a ales. */
  const skipNext = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return; }

    const text = value.trim();
    if (text.length < 3) { setItems([]); setOpen(false); return; }

    /* 280ms: sub atât se trimite o cerere la fiecare literă degeaba, peste atât
       lista pare că vine în urma degetului. */
    const timer = window.setTimeout(async () => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      const found = await suggestAddresses(text, controller.signal);
      if (controller.signal.aborted) return;
      setItems(found);
      setActive(-1);
      setOpen(found.length > 0);
    }, 280);

    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => () => abort.current?.abort(), []);

  const choose = (item: AddressSuggestion) => {
    skipNext.current = true;
    onPick(item);
    setOpen(false);
    setItems([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && active >= 0) {
      // Enter pe o variantă aleasă înseamnă „asta", nu „trimite formularul"
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="sf-ac">
      <input
        id={id}
        type="text"
        className="sf-field__input"
        placeholder={placeholder}
        value={value}
        /* Lista browserului și lista noastră s-ar suprapune una peste alta, iar
           a noastră știe și coordonatele. */
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (items.length > 0) setOpen(true); }}
        onBlur={e => {
          setOpen(false);
          onBlur?.(e);
        }}
      />

      {open && items.length > 0 && (
        <ul className="sf-ac__list" id={listId} role="listbox" aria-label="Adrese propuse">
          {items.map((item, i) => (
            <li key={`${item.label}-${item.lat}-${item.lng}`}>
              <button
                type="button"
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="sf-ac__item"
                data-active={i === active}
                /* `mousedown`, nu `click`: apăsarea scoate focusul din câmp, iar
                   `blur` ar închide lista înainte ca butonul să apuce clicul. */
                onMouseDown={e => { e.preventDefault(); choose(item); }}
                onMouseEnter={() => setActive(i)}
              >
                <MapPin size={16} weight="fill" aria-hidden="true" />
                <span className="sf-ac__text">
                  <span className="sf-ac__label">{item.label}</span>
                  {item.detail && <span className="sf-ac__detail">{item.detail}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
