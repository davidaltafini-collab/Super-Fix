import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import { CheckCircle, CrosshairSimple, Minus, Plus } from '@phosphor-icons/react';

import { GeoPoint, reverseGeocode } from '@/lib/geo';
import { isLocalityOnly } from '@/lib/place';
import base from './map/superfixLayers.json';
import { TOWNS_RO } from './map/towns';
import './map.css';

/* ============================================================
   Hărțile — harta NOASTRĂ, aceeași ca în aplicație.

   Aplicația desenează cu MapLibre o hartă a României ținută pe serverul nostru
   (`harta.pmtiles`, `api.super-fix.ro/harta`), cu stilul „Hârtie + Lut” ales de
   David pe 26.09. Aici e același motor (MapLibre GL JS), același fișier și
   EXACT același stil (`map/superfixLayers.json`, copiat din aplicație): aceleași
   culori pentru pământ, apă, străzi și litere, aceleași clădiri ridicate.

   Plăcile vin prin `/harta` de pe domeniul sitului (rescrierea din
   `vercel.json` le aduce de pe server): serverul hărții nu trimite antete CORS,
   iar de pe același domeniu nici nu e nevoie. `VITE_MAP_URL` o poate muta.

   Pinul e cel de brand, desenat de noi (`map.css`), ca în aplicație (`BrandPin`).
   ============================================================ */

const MAP_BASE = (import.meta.env.VITE_MAP_URL || '/harta').replace(/\/$/, '');
const absolute = (path: string) => new URL(path, window.location.origin).href.replace(/\/$/, '');

let ready = false;
function setup() {
  if (ready) return;
  ready = true;
  maplibregl.setWorkerUrl(workerUrl);
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
}

/** Harta slăbită (10.11, `scripts/harta/slabeste.mjs` în aplicație): doar ce desenează stilul, aspectul identic.
    Alt nume la fiecare refacere (browserul ține minte antetul fișierului vechi), același ca în aplicație. */
const MAP_FILE = 'harta-20261110.pmtiles';

/** Stilul aplicației, legat de locul unde stau datele și literele. */
function superfixStyle(): StyleSpecification {
  const root = absolute(MAP_BASE);
  return {
    version: 8,
    glyphs: `${root}/fonts/{fontstack}/{range}.pbf`,
    sources: { protomaps: { type: 'vector', url: `pmtiles://${root}/${MAP_FILE}`, attribution: '© OpenStreetMap' } },
    light: base.light,
    layers: base.layers,
  } as unknown as StyleSpecification;
}

/** Primul strat de litere: ce desenăm noi (zona) stă sub nume, ca în aplicație. */
const FIRST_LABEL = (base.layers as { id: string; type: string }[]).find(layer => layer.type === 'symbol')?.id;

/** De la zoom 15 clădirile se ridică; harta se înclină odată cu ele, până la 45° (ca în aplicație). */
export const pitchForZoom = (zoom: number) => Math.max(0, Math.min(45, (zoom - 15) * 30));

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Zoomul la care se vede blocul adresei (ca `LocationPreview` din aplicație). */
const CLOSE_ZOOM = 17;

interface CreateOptions {
  center: GeoPoint;
  zoom: number;
  interactive: boolean;
  tilt?: boolean;
}

function createMap(container: HTMLElement, { center, zoom, interactive, tilt = true }: CreateOptions): MlMap {
  setup();
  const map = new maplibregl.Map({
    container,
    style: superfixStyle(),
    center: [center.lng, center.lat],
    zoom,
    pitch: tilt ? pitchForZoom(zoom) : 0,
    maxPitch: 60,
    minZoom: 3,
    maxZoom: 19,
    interactive,
    // Într-o pagină care se derulează, rotița derulează pagina, nu harta.
    scrollZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    keyboard: interactive,
    attributionControl: { compact: true },
    fadeDuration: 0,
    cancelPendingTileRequestsWhileZooming: true,
  });
  if (interactive) map.touchZoomRotate.disableRotation();
  quietAttribution(map);
  return map;
}

/** Atribuirea stă strânsă în (i), ca în aplicație: se desface doar la atingere. */
function quietAttribution(map: MlMap) {
  /* MapLibre desface atribuirea când sosesc datele sursei; o strângem după ce harta s-a așezat. */
  const fold = () => map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact')?.classList.remove('maplibregl-compact-show');
  map.on('sourcedata', fold);
  map.once('idle', () => {
    fold();
    map.off('sourcedata', fold);
  });
}

/** Harta își urmează cutia: foile cresc animat, iar MapLibre măsoară doar fereastra. */
function followSize(map: MlMap, el: HTMLElement) {
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.resize()) : null;
  observer?.observe(el);
  const settle = window.setTimeout(() => map.resize(), 320);
  return () => {
    observer?.disconnect();
    window.clearTimeout(settle);
  };
}

/** Pinul de brand: picătura roșie, colțul de jos pe coordonată, umbra pe pământ. */
function pinElement(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'sf-pin-wrap';
  el.innerHTML = '<span class="sf-pin"><span class="sf-pin__dot"></span></span><span class="sf-pin__shadow"></span>';
  return el;
}

/* ---------------- previzualizare (cardul locului, detaliul misiunii) ---------------- */

interface MapPreviewProps {
  /** Lipsă (cu `around`): harta zonei, fără pin — locul încă nu e ales. */
  point: GeoPoint | null;
  around?: GeoPoint | null;
  /** pentru cititoarele de ecran */
  label?: string;
  height?: number;
  zoom?: number;
  className?: string;
  /** colțuri rotunjite și umbră proprie; în cardul locului harta e doar partea de sus */
  framed?: boolean;
}

/**
 * Hartă care nu se mișcă sub deget: e o verificare, nu o alegere (ca `LocationPreview` cu `still`).
 * Locul schimbat o face să alunece la el, fără să se reîncarce.
 */
export const MapPreview: React.FC<MapPreviewProps> = ({
  point, around = null, label, height = 200, zoom = CLOSE_ZOOM, className, framed = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const at = point ?? around;
  const atZoom = point ? zoom : 10.5;

  useEffect(() => {
    if (!ref.current || mapRef.current || !at) return;
    const map = createMap(ref.current, { center: at, zoom: atZoom, interactive: false });
    mapRef.current = map;
    const stop = followSize(map, ref.current);
    return () => {
      stop();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(at)]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !at) return;
    if (point) {
      if (!markerRef.current) markerRef.current = new maplibregl.Marker({ element: pinElement(), anchor: 'bottom' });
      markerRef.current.setLngLat([point.lng, point.lat]).addTo(map);
    } else {
      markerRef.current?.remove();
    }
    const now = map.getCenter();
    if (Math.abs(now.lat - at.lat) < 1e-7 && Math.abs(now.lng - at.lng) < 1e-7 && Math.abs(map.getZoom() - atZoom) < 0.01) return;
    map.easeTo({ center: [at.lng, at.lat], zoom: atZoom, pitch: pitchForZoom(atZoom), duration: reducedMotion() ? 0 : 420 });
  }, [at?.lat, at?.lng, point ? 1 : 0, atZoom]);

  return (
    <div
      ref={ref}
      className={`sf-map ${framed ? 'sf-map--framed' : ''} ${className || ''}`}
      style={{ height }}
      role="img"
      aria-label={label || (point ? 'Hartă cu locul lucrării' : 'Hartă cu zona meseriașului')}
    />
  );
};

/* ---------------- alegerea locului (foaia „Unde e problema?”) ---------------- */

interface MapPickerProps {
  point: GeoPoint | null;
  /** adresa scrisă: dacă e doar o localitate, cerem casa */
  address?: string;
  /** de unde pornește harta când nu e ales niciun loc (zona meseriașului) */
  around?: GeoPoint | null;
  onChange: (point: GeoPoint, address?: string) => void;
  height?: number;
  /** „Locație exactă” sub hartă; oprit cât timp cerem chiar casa („Unde anume în…?”) */
  showExact?: boolean;
  className?: string;
}

/** Centrul României, ca punct de pornire când nu știm nimic despre client. */
const COUNTRY: GeoPoint = { lat: 45.9432, lng: 24.9668 };

/** Promisiune cu limită de timp: geocodarea poate să nu răspundă niciodată. */
const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<undefined>(resolve => window.setTimeout(() => resolve(undefined), ms))]);

/**
 * Pinul NU se trage: stă țintuit în mijloc, iar harta se mișcă sub el (Uber, Bolt, aplicația).
 * Când harta se oprește, centrul ei e noul loc, iar adresa se află singură.
 */
export const MapPicker: React.FC<MapPickerProps> = ({
  point, address = '', around = null, onChange, height = 240, showExact = true, className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pointRef = useRef(point);
  pointRef.current = point;

  const [moving, setMoving] = useState(false);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const start = point ?? around ?? COUNTRY;
    const zoom = point ? CLOSE_ZOOM : around ? 11 : 6;
    const map = createMap(ref.current, { center: start, zoom, interactive: true });
    mapRef.current = map;

    let user = false;
    map.on('movestart', e => {
      if (!(e as { originalEvent?: Event }).originalEvent) return;
      user = true;
      setMoving(true);
    });
    map.on('moveend', async () => {
      setMoving(false);
      // Ce mută omul: după apropiere, harta se înclină singură (ca în aplicație).
      const want = pitchForZoom(map.getZoom());
      if (Math.abs(map.getPitch() - want) > 1) {
        map.easeTo({ pitch: want, duration: reducedMotion() ? 0 : 450 });
      }
      if (!user) return;
      user = false;
      const c = map.getCenter();
      const next = { lat: c.lat, lng: c.lng };
      const prev = pointRef.current;
      // Sub ~8 m nu s-a schimbat nimic real: e tremurul de așezare al hărții.
      if (prev && Math.abs(prev.lat - next.lat) < 7e-5 && Math.abs(prev.lng - next.lng) < 9e-5) return;
      setReading(true);
      const found = await withTimeout(reverseGeocode(next), 6000);
      setReading(false);
      onChangeRef.current(next, found);
    });

    const stop = followSize(map, ref.current);
    return () => {
      stop();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Locul venit din afară (căutarea, „Folosește locația mea”, un loc știut) mută harta la el. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !point) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - point.lat) < 7e-5 && Math.abs(c.lng - point.lng) < 9e-5) return;
    const zoom = Math.max(map.getZoom(), CLOSE_ZOOM);
    map.easeTo({ center: [point.lng, point.lat], zoom, pitch: pitchForZoom(zoom), duration: reducedMotion() ? 0 : 420 });
  }, [point?.lat, point?.lng]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map || !point) return;
    map.easeTo({ center: [point.lng, point.lat], duration: reducedMotion() ? 0 : 420 });
  };
  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = Math.min(19, Math.max(3, map.getZoom() + delta));
    map.easeTo({ zoom, pitch: pitchForZoom(zoom), duration: reducedMotion() ? 0 : 300 });
  };

  const hint = reading
    ? 'Caut adresa…'
    : moving
      ? 'Dă drumul când pinul e pe casă'
      : !point
        ? 'Mută harta până pinul e pe casă, sau scrie adresa.'
        : null;

  return (
    <div className={`sf-map-picker ${className || ''}`}>
      <div className="sf-map-picker__frame" style={{ height }}>
        <div ref={ref} className="sf-map" style={{ height }} aria-label="Hartă: mută harta până pinul e pe casă" />

        {/* Pinul din mijloc: se ridică puțin cât timp harta alunecă sub el. */}
        <span className="sf-map-picker__pin" data-lifted={moving} aria-hidden="true">
          <span className="sf-pin"><span className="sf-pin__dot" /></span>
          <span className="sf-pin__shadow" />
        </span>

        <div className="sf-map-picker__tools">
          {point && (
            <button type="button" onClick={recenter} className="sf-map-btn" aria-label="Centrează pe pin">
              <CrosshairSimple size={17} weight="bold" aria-hidden="true" />
            </button>
          )}
          <div className="sf-map-zoom">
            <button type="button" onClick={() => zoomBy(1)} aria-label="Mai aproape"><Plus size={16} weight="bold" aria-hidden="true" /></button>
            <button type="button" onClick={() => zoomBy(-1)} aria-label="Mai departe"><Minus size={16} weight="bold" aria-hidden="true" /></button>
          </div>
        </div>
      </div>

      {hint ? (
        <p className="sf-map-picker__hint" data-active={moving || reading} aria-live="polite">{hint}</p>
      ) : showExact && point && isLocalityOnly(address) ? (
        <p className="sf-map-picker__ask"><span aria-hidden="true" />Mută harta până pinul e pe casă.</p>
      ) : showExact && point ? (
        <p className="sf-map-picker__ok">
          <CheckCircle size={14} weight="fill" aria-hidden="true" />
          Locație exactă. Mișcă harta dacă nu e chiar acolo.
        </p>
      ) : null}
    </div>
  );
};

/* ---------------- zona meseriașului (profilul) ---------------- */

const KM_PER_DEG_LAT = 110.54;
const KM_PER_DEG_LNG = 111.32;
/** Cât din latura mică a hărții ocupă cadrul (zona și bucata de inel). */
const FIT_RATIO = 0.72;
/** Cât din inel intră în cadru, față de raza zonei. */
const RING_IN_FRAME = 0.3;
const OUTSIDE_VEIL = 'rgba(240,243,247,0.62)';
const RING_WASH = 'rgba(245,160,60,0.16)';
const RING_EDGE = 'rgba(208,112,13,0.45)';
const ZONE_FILL = 'rgba(31,164,99,0.06)';
const ZONE_EDGE = '#1FA463';

/** Cercul de `radiusKm` în jurul unui loc, ca inel GeoJSON [lng, lat]. */
function circle(center: GeoPoint, radiusKm: number, points = 128): [number, number][] {
  const toRad = Math.PI / 180;
  const d = radiusKm / 6371;
  const lat1 = center.lat * toRad;
  const lng1 = center.lng * toRad;
  const ring = Array.from({ length: points }, (_, i) => {
    const bearing = (i / points) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return [lng2 / toRad, lat2 / toRad] as [number, number];
  });
  return [...ring, ring[0]];
}

type Town = { name: string; lat: number; lng: number; pop: number; city: boolean };
let towns: Town[] | null = null;
const allTowns = () =>
  (towns ??= TOWNS_RO.trim().split('\n').map(line => {
    const [name, lat, lng, pop, kind] = line.split('|');
    return { name, lat: Number(lat), lng: Number(lng), pop: Number(pop), city: kind === 'M' };
  }));

interface ZoneMapProps {
  lat: number;
  lng: number;
  radiusKm: number;
  /** Inelul portocaliu: încă atâția km dincolo de zonă (lipsă/0 = n-are). */
  travelKm?: number | null;
  height?: number;
  label?: string;
}

/**
 * Zona reală a meseriașului (ca `ZoneMap` din aplicație): cercul verde, inelul portocaliu în care
 * vine cu bani pe km, iar dincolo harta stinsă. Încadrată pe zona verde; numele orașelor le scrie
 * harta asta singură, ca să se vadă la orice depărtare. Nu se mișcă.
 */
export const ZoneMap: React.FC<ZoneMapProps> = ({ lat, lng, radiusKm, travelKm, height = 196, label }) => {
  const ref = useRef<HTMLDivElement>(null);
  const extra = travelKm && travelKm > 0 ? travelKm : 0;
  const outerKm = radiusKm + extra;
  const frameKm = radiusKm + Math.min(extra, Math.max(radiusKm * RING_IN_FRAME, 2));

  const shapes = useMemo(() => {
    const center = { lat, lng };
    const green = circle(center, radiusKm);
    const outer = extra ? circle(center, outerKm) : green;
    const span = Math.max(outerKm, frameKm) * 6 + 200;
    const dLat = span / KM_PER_DEG_LAT;
    const dLng = span / (KM_PER_DEG_LNG * Math.cos((lat * Math.PI) / 180));
    const world: [number, number][] = [
      [lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat], [lng - dLng, lat + dLat], [lng - dLng, lat - dLat],
    ];
    return { green, outer, world };
  }, [lat, lng, radiusKm, outerKm, frameKm, extra]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dLat = frameKm / FIT_RATIO / KM_PER_DEG_LAT;
    const dLng = frameKm / FIT_RATIO / (KM_PER_DEG_LNG * Math.cos((lat * Math.PI) / 180));
    setup();
    const map = new maplibregl.Map({
      container: el,
      style: superfixStyle(),
      bounds: [[lng - dLng, lat - dLat], [lng + dLng, lat + dLat]],
      interactive: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    quietAttribution(map);

    map.on('load', () => {
      const cos = Math.cos((lat * Math.PI) / 180);
      const names = new Set<string>();
      const features = allTowns().flatMap((town, rank) => {
        const km = Math.hypot((town.lng - lng) * KM_PER_DEG_LNG * cos, (town.lat - lat) * KM_PER_DEG_LAT);
        if (km > frameKm * 2.2) return [];
        names.add(town.name);
        return [{
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [town.lng, town.lat] },
          properties: { name: town.name, rank, big: town.city || town.pop >= 50000, reach: km <= outerKm },
        }];
      });
      // Același oraș o singură dată: numele de bază ale orașelor pe care le scriem noi se scot.
      if (map.getLayer('places_locality') && names.size) {
        map.setFilter('places_locality', [
          'all',
          ['==', ['get', 'kind'], 'locality'],
          ['match', ['coalesce', ['get', 'name:ro'], ['get', 'name'], ''], [...names], false, true],
        ] as any);
      }
      map.addSource('sf-zone', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { part: 'veil' }, geometry: { type: 'Polygon', coordinates: [shapes.world, [...shapes.outer].reverse()] } },
            ...(extra ? [{ type: 'Feature' as const, properties: { part: 'ring' }, geometry: { type: 'Polygon' as const, coordinates: [shapes.outer, [...shapes.green].reverse()] } }] : []),
            { type: 'Feature', properties: { part: 'zone' }, geometry: { type: 'Polygon', coordinates: [shapes.green] } },
          ],
        },
      });
      map.addLayer({ id: 'sf-zone-veil', type: 'fill', source: 'sf-zone', filter: ['==', ['get', 'part'], 'veil'], paint: { 'fill-color': OUTSIDE_VEIL } }, FIRST_LABEL);
      map.addLayer({ id: 'sf-zone-ring', type: 'fill', source: 'sf-zone', filter: ['==', ['get', 'part'], 'ring'], paint: { 'fill-color': RING_WASH } }, FIRST_LABEL);
      map.addLayer({ id: 'sf-zone-ring-edge', type: 'line', source: 'sf-zone', filter: ['==', ['get', 'part'], 'ring'], paint: { 'line-color': RING_EDGE, 'line-width': 1.2 } }, FIRST_LABEL);
      map.addLayer({ id: 'sf-zone-fill', type: 'fill', source: 'sf-zone', filter: ['==', ['get', 'part'], 'zone'], paint: { 'fill-color': ZONE_FILL } }, FIRST_LABEL);
      map.addLayer({ id: 'sf-zone-edge', type: 'line', source: 'sf-zone', filter: ['==', ['get', 'part'], 'zone'], paint: { 'line-color': ZONE_EDGE, 'line-width': 2 } }, FIRST_LABEL);
      map.addSource('sf-zone-towns', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: 'sf-zone-towns-label',
        type: 'symbol',
        source: 'sf-zone-towns',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['case', ['get', 'big'], ['literal', ['Nunito Bold']], ['literal', ['Nunito Regular']]],
          'text-size': ['case', ['get', 'big'], 12.5, 11],
          'symbol-sort-key': ['get', 'rank'],
          'text-padding': 6,
          'text-max-width': 7,
        },
        paint: {
          'text-color': ['case', ['get', 'reach'], '#2E333B', '#8A93A1'],
          'text-halo-color': '#F4F6FA',
          'text-halo-width': 1.3,
        },
      });
    });

    const stop = followSize(map, el);
    return () => {
      stop();
      map.remove();
    };
  }, [lat, lng, radiusKm, extra, frameKm, outerKm, shapes]);

  return (
    <div
      ref={ref}
      className="sf-map sf-map--framed"
      style={{ height }}
      role="img"
      aria-label={label || `Zona de lucru: ${Math.round(radiusKm)} de kilometri în jurul sediului`}
    />
  );
};
