import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { NavigationArrow, Crosshair } from '@phosphor-icons/react';

import { GeoPoint, reverseGeocode } from '@/lib/geo';
import './map.css';

/* ============================================================
   Hărți — Leaflet direct, fără react-leaflet.

   Un singur ambalaj scris de noi în loc de încă o dependență: avem control pe
   pin, pe curbe și pe stil, iar harta arată ca restul sitului.

   Tăiețeii sunt CARTO Positron: gri deschis, curat, se așază sub sticla albă a
   sitului. Tăiețeii OSM impliciți arată vechi — de-aia a renunțat și aplicația
   la ei. Se schimbă dintr-o singură constantă dacă e nevoie vreodată.
   ============================================================ */

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const TILE_SUBDOMAINS = 'abcd';

/** Pinul de brand, desenat ca marcaj Leaflet (divIcon), nu ca imagine. */
const brandPin = (pulsing = false) =>
  L.divIcon({
    className: 'sf-pin-wrap',
    html: `<span class="sf-pin${pulsing ? ' sf-pin--live' : ''}"><span class="sf-pin__dot"></span></span>`,
    iconSize: [30, 40],
    iconAnchor: [15, 38],
  });

const baseOptions = (interactive: boolean): L.MapOptions => ({
  zoomControl: interactive,
  scrollWheelZoom: false, // altfel derulezi pagina și rămâi blocat în hartă
  dragging: interactive,
  doubleClickZoom: interactive,
  touchZoom: interactive,
  keyboard: interactive,
  attributionControl: true,
});

/* ---------------- previzualizare (erou) ---------------- */

interface MapPreviewProps {
  point: GeoPoint;
  /** apare în bula pinului */
  label?: string;
  height?: number;
  zoom?: number;
  className?: string;
}

/**
 * Hartă statică cu pin. Nu se mișcă, nu se apropie: e o previzualizare, iar
 * navigația reală se face în Waze sau Maps.
 */
export const MapPreview: React.FC<MapPreviewProps> = ({
  point, label, height = 200, zoom = 15, className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, baseOptions(false)).setView([point.lat, point.lng], zoom);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: TILE_SUBDOMAINS, maxZoom: 19 }).addTo(map);
    const marker = L.marker([point.lat, point.lng], { icon: brandPin(), keyboard: false }).addTo(map);
    if (label) marker.bindPopup(label);
    mapRef.current = map;

    // containerul poate fi încă în animație la montare: remăsurăm după ce se așază
    const settle = window.setTimeout(() => map.invalidateSize(), 260);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.invalidateSize())
      : null;
    if (observer && ref.current) observer.observe(ref.current);

    return () => {
      window.clearTimeout(settle);
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // harta există deja: mutăm doar vederea și pinul, n-o reconstruim
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([point.lat, point.lng], zoom);
    map.eachLayer(layer => { if (layer instanceof L.Marker) layer.setLatLng([point.lat, point.lng]); });
  }, [point.lat, point.lng, zoom]);

  return <div ref={ref} className={`sf-map ${className || ''}`} style={{ height }} aria-label="Hartă cu locația lucrării" />;
};

/* ---------------- alegerea locației (client) ---------------- */

interface MapPickerProps {
  point: GeoPoint | null;
  onChange: (point: GeoPoint, address?: string) => void;
  height?: number;
  className?: string;
}

/** Centrul României, ca punct de pornire când nu știm nimic despre client. */
const FALLBACK: GeoPoint = { lat: 45.9432, lng: 24.9668 };

/**
 * Hartă pe care clientul își pune pinul exact unde e problema.
 *
 * De ce contează: adresa scrisă de mână se poate nimeri greșit, iar geocodarea
 * poate cădea pe alt capăt al străzii. Pinul mutabil e singura cale prin care
 * eroul primește coordonate în care poate avea încredere. La fiecare mutare
 * facem reverse-geocode, ca adresa scrisă să rămână în acord cu pinul.
 */
export const MapPicker: React.FC<MapPickerProps> = ({ point, onChange, height = 240, className }) => {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const start = point ?? FALLBACK;
    const map = L.map(ref.current, baseOptions(true)).setView([start.lat, start.lng], point ? 16 : 6);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, subdomains: TILE_SUBDOMAINS, maxZoom: 19 }).addTo(map);

    const marker = L.marker([start.lat, start.lng], {
      icon: brandPin(),
      draggable: true,
      autoPan: true,
      keyboard: true,
      title: 'Trage pinul unde e problema',
    }).addTo(map);

    const commit = async (latlng: L.LatLng) => {
      setMoving(true);
      const next = { lat: latlng.lat, lng: latlng.lng };
      const address = await reverseGeocode(next);
      setMoving(false);
      onChangeRef.current(next, address);
    };

    marker.on('dragend', () => commit(marker.getLatLng()));
    // tap pe hartă mută pinul: mai rapid decât să-l tragi pe telefon
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng);
      commit(e.latlng);
    });

    mapRef.current = map;
    markerRef.current = marker;

    const settle = window.setTimeout(() => map.invalidateSize(), 260);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.invalidateSize())
      : null;
    if (observer && ref.current) observer.observe(ref.current);

    return () => {
      window.clearTimeout(settle);
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Când coordonatele vin din altă parte — butonul „Folosește locația mea" —
     mutăm pinul, dar NU chemăm onChange: n-a fost o acțiune pe hartă. */
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !point) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - point.lat) < 1e-7 && Math.abs(current.lng - point.lng) < 1e-7) return;
    marker.setLatLng([point.lat, point.lng]);
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 16));
  }, [point?.lat, point?.lng]);

  const recenter = () => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (map && marker) map.setView(marker.getLatLng(), Math.max(map.getZoom(), 16));
  };

  return (
    <div className={`sf-map-picker ${className || ''}`}>
      <div ref={ref} className="sf-map" style={{ height }} aria-label="Hartă: mută pinul pe locul lucrării" />

      <div className="sf-map-picker__hint">
        <Crosshair size={15} weight="bold" aria-hidden="true" />
        {moving ? 'Caut adresa…' : 'Trage pinul sau apasă pe hartă ca să-l muți exact'}
      </div>

      <button type="button" onClick={recenter} className="sf-map-picker__recenter" aria-label="Centrează pe pin">
        <NavigationArrow size={16} weight="fill" aria-hidden="true" />
      </button>
    </div>
  );
};
