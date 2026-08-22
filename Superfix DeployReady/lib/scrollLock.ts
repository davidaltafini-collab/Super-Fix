/* ============================================================
   Blocarea derularii, numarata.

   Fiecare panou care se deschide peste pagina (Sheet, Lightbox, dosarul de
   misiuni, camera, decuparea pozei, confirmarile) tinea singur minte ce era
   inainte in `body.style.overflow` si punea la loc valoarea aia la inchidere.
   Merge cat timp se inchid exact in ordinea inversa a deschiderii.

   Cand nu se inchid asa — si nu se inchid, pentru ca unele se demonteaza cu
   intarziere (Sheet mai sta 420ms dupa ce s-a inchis), iar o confirmare poate
   aparea peste un panou deja deschis — al doilea panou apuca sa citeasca
   `hidden` drept „valoarea de dinainte" si o pune inapoi la iesire. Pagina
   ramane blocata pentru totdeauna: nu mai derulezi, nu mai poti trage de sus
   ca sa reincarci, si pare ca s-a stricat tot situl.

   Aici e o singura numaratoare: se blocheaza la primul care cere si se
   deblocheaza abia cand pleaca si ultimul, indiferent de ordine.
   ============================================================ */

let holders = 0;
let restore = '';

/** Blocheaza derularea paginii. Intoarce functia care elibereaza (sigura la apel repetat). */
export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  if (holders === 0) {
    restore = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) document.body.style.overflow = restore;
  };
}
