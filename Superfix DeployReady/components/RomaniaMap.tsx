import React, { useLayoutEffect, useRef } from 'react';
import { ROMANIA_SVG_STRING } from './romaniaSvg';
import './RomaniaMap.css';

interface RomaniaMapProps {
  /** Array of selected county codes (e.g., ['CJ', 'B', 'TM']) */
  value: string[];
  /** Callback when a county is clicked. If undefined, map is read-only. */
  onToggle?: (code: string) => void;
  className?: string;
}

export const RomaniaMap: React.FC<RomaniaMapProps> = ({
  value,
  onToggle,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isReadOnly = !onToggle;

  // SCHIMBAT: useLayoutEffect în loc de useEffect
  // Se execută SINCRON după ce DOM-ul este updatat, înainte de paint
  // Astfel clasele de selecție sunt aplicate IMEDIAT după ce SVG-ul este inserat
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    // Select all county elements within our container
    const countyElements = containerRef.current.querySelectorAll('.county');

    countyElements.forEach((el) => {
      // Cast to Element to access datasets and classList
      const element = el as Element;
      // Read data-county attribute from the SVG path
      const countyCode = element.getAttribute('data-county');

      if (countyCode) {
        if (value.includes(countyCode)) {
          element.classList.add('is-selected');
          // Optional: bring to front visually by appending to parent
          const parent = element.parentElement;
          if (parent) {
            parent.appendChild(element);
          }
        } else {
          element.classList.remove('is-selected');
        }
      }
    });
  }); // SCHIMBAT: Fără dependențe = rulează la FIECARE render

  // Event Delegation Handler
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isReadOnly || !onToggle) return;

    // Find the closest element with the class 'county' relative to the click target
    const target = e.target as Element;
    const countyElement = target.closest('.county');

    if (countyElement) {
      const countyCode = countyElement.getAttribute('data-county');
      if (countyCode) {
        onToggle(countyCode);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`romania-map-container ${isReadOnly ? 'read-only' : ''} ${className}`}
      onClick={handleClick}
      // Render the raw SVG string
      dangerouslySetInnerHTML={{ __html: ROMANIA_SVG_STRING }}
    />
  );
};