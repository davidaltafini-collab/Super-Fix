import type React from 'react';
import { useSyncExternalStore } from 'react';
import {
  Lightning, Plug, SolarPanel, Drop, Pipe, Bathtub, Toilet, Flame, Snowflake, Fan, Thermometer,
  Wrench, Gear, Engine, Car, Tire, Bicycle, Truck, Package, Bulldozer, Crane, HardHat, Barricade,
  Shovel, Wall, SquaresFour, PaintRoller, Ladder, HouseSimple, HouseLine, DoorOpen, Hammer, Axe,
  Ruler, Couch, Key, Lock, SecurityCamera, WifiHigh, Desktop, Television, WashingMachine, CookingPot,
  Broom, Trash, Sparkle, Plant, Tree, Flower, SwimmingPool, PawPrint, Baby, Scissors, TShirt, Toolbox,
  DotsThreeOutline,
} from '@phosphor-icons/react';
import { API_URL } from '../config/api';

/* ICONIȚA UNEI MESERII — sursa unică pe site (era copiată în HeroListCard și HeroProfile).

   Adminul poate alege iconița unei meserii noi (`/api/trades/icons`); fără alegere,
   rămâne desenul de aici, același ca în aplicație (`tradeIconFor`). Cheia meseriei e
   ca pe server: fără diacritice, litere mici, fără spații în plus — „Utilaje " și
   „utilaje" sunt aceeași meserie. */

export const tradeKey = (label: string) =>
  (label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro-RO').replace(/\s+/g, ' ').trim();

/* Iconițele din care alege adminul — aceleași nume ca pe server. Import static, nu
   toată biblioteca: un nume necunoscut (adăugat pe server după build) e ignorat. */
export const CHOSEN_ICONS: Record<string, React.ElementType> = {
  Lightning, Plug, SolarPanel, Drop, Pipe, Bathtub, Toilet, Flame, Snowflake, Fan, Thermometer,
  Wrench, Gear, Engine, Car, Tire, Bicycle, Truck, Package, Bulldozer, Crane, HardHat, Barricade,
  Shovel, Wall, SquaresFour, PaintRoller, Ladder, HouseSimple, HouseLine, DoorOpen, Hammer, Axe,
  Ruler, Couch, Key, Lock, SecurityCamera, WifiHigh, Desktop, Television, WashingMachine, CookingPot,
  Broom, Trash, Sparkle, Plant, Tree, Flower, SwimmingPool, PawPrint, Baby, Scissors, TShirt, Toolbox,
};

// Desenul de rezervă, ca în aplicație. „Utilaje" și „Altele" au silueta lor, nu servieta.
const DEFAULT_ICONS: Record<string, React.ElementType> = {
  electrician: Lightning,
  instalator: Drop,
  mecanic: Wrench,
  zugrav: PaintRoller,
  tamplar: Hammer,
  lacatus: Key,
  curatenie: Broom,
  faiantar: SquaresFour,
  utilaje: Bulldozer,
  altele: DotsThreeOutline,
};

/** Iconița de rezervă (fără alegerea din admin). */
export const defaultTradeIcon = (label: string): React.ElementType =>
  DEFAULT_ICONS[tradeKey(label)] || Toolbox;

/** `chosen` = `useTradeIcons()`; alegerea din admin bate desenul de rezervă. */
export const tradeIcon = (label: string, chosen?: Readonly<Record<string, string>>): React.ElementType => {
  const name = chosen?.[tradeKey(label)];
  return (name && CHOSEN_ICONS[name]) || defaultTradeIcon(label);
};

/* Alegerile vin o dată pe încărcarea paginii; o cerere picată = iconițele de rezervă. */
let icons: Readonly<Record<string, string>> = {};
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setIcons = (next: Record<string, string>) => {
  icons = next;
  listeners.forEach(listener => listener());
};

const load = () => {
  loading ??= fetch(`${API_URL}/trades/icons`)
    .then(res => (res.ok ? res.json() : {}))
    .then((data: any) => {
      const out: Record<string, string> = {};
      const raw = data?.icons;
      if (raw && typeof raw === 'object') {
        for (const [key, name] of Object.entries(raw)) if (typeof name === 'string') out[key] = name;
      }
      setIcons(out);
    })
    .catch(() => {});
  return loading;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  load();
  return () => { listeners.delete(listener); };
};

/** În componentele care desenează iconița unei meserii: se redesenează când sosesc alegerile. */
export const useTradeIcons = () => useSyncExternalStore(subscribe, () => icons, () => icons);

/** După o alegere în admin: pagina deschisă o vede imediat, fără reîncărcare. */
export const setChosenTradeIcon = (key: string, name: string | null) => {
  const next = { ...icons };
  if (name) next[key] = name; else delete next[key];
  setIcons(next);
};
