/* ============================================================
   Politica de confidențialitate, ca date: aceeași sursă pentru pagina
   `/privacy` (pages/LegalPages.tsx) și pentru HTML-ul trimis de server
   (api/ssr.ts). Google Play citește politica fără să ruleze aplicația
   (respingerea din 25.10.2026: „LOCATION data is accessed by the app but
   not disclosed in privacy policy”), deci textul trebuie să fie și în HTML.

   Fără `import.meta.env` aici: fișierul rulează și în funcția edge.
   ============================================================ */

export const PRIVACY_UPDATED_AT = '25.10.2026';
export const PRIVACY_TITLE = 'Politica de Confidențialitate (GDPR)';

/** Bucăți de text: simplu, îngroșat, emailul de contact sau identitatea operatorului. */
export type PolicyInline = string | { strong: string } | { email: true } | { operator: true };
export type PolicyBlock =
  | { kind: 'h'; text: string }
  | { kind: 'p'; parts: PolicyInline[] }
  | { kind: 'ul'; items: PolicyInline[][] };

const item = (label: string, body: string): PolicyInline[] => [{ strong: `${label}:` }, ` ${body}`];

export const PRIVACY_BLOCKS: PolicyBlock[] = [
  { kind: 'h', text: '1. Operatorul de date' },
  { kind: 'p', parts: ['Datele sunt prelucrate de ', { operator: true }, '. Solicitările privind datele personale pot fi trimise la ', { email: true }, '.'] },

  { kind: 'h', text: '2. Datele prelucrate și scopurile' },
  {
    kind: 'ul',
    items: [
      item('Identitate și contact', 'nume, email, telefon și adresă, pentru cont, solicitări și comunicarea dintre părți.'),
      item('Profil profesional', 'specializări, zone, descriere, tarife și materiale de profil, pentru publicarea și administrarea profilului Eroului.'),
      item('Cereri, mesaje și imagini', 'pentru executarea solicitărilor, conversații, notificări, suport și soluționarea incidentelor.'),
      item('Localizare', 'locația aproximativă sau precisă a telefonului, numai cu permisiunea ta, în condițiile de la punctul 3.'),
      item('Securitate și dispozitiv', 'sesiuni, jurnale de audit și tokenuri push, pentru autentificare, notificări și prevenirea fraudei.'),
      item('Facturare', 'starea plăților, identificatori de tranzacție, token tehnic și date mascate ale cardului. NETOPIA Payments colectează direct datele complete ale cardului; Superfix nu le stochează.'),
      item('Recruiteri', 'codul, atribuirile, comisioanele și IBAN-ul necesar plății. IBAN-ul este criptat în baza de date și este disponibil numai persoanelor autorizate pentru operațiuni.'),
      item('Retrageri și reclamații', 'nume, email, identificatorul și data contractului, conținutul declarației, data și ora transmiterii, pentru înregistrarea cererii, confirmare și soluționare.'),
    ],
  },

  { kind: 'h', text: '3. Localizarea (datele de locație)' },
  { kind: 'p', parts: ['Aplicația Superfix accesează locația telefonului numai după ce îți dai permisiunea în sistemul de operare. Fără permisiune, aplicația funcționează în continuare, fără funcțiile de mai jos.'] },
  {
    kind: 'ul',
    items: [
      item('Clienți: meseriași în apropiere', 'locația telefonului este folosită ca să-ți arătăm Eroii din apropiere și distanța până la ei. Coordonatele sunt trimise serverului doar pentru căutarea respectivă și nu sunt salvate în contul tău. Poți alege oricând un loc manual în locul locației telefonului.'),
      item('Clienți: adresa lucrării', 'adresa unei cereri și coordonatele ei se salvează împreună cu cererea, ca Eroul care o preia să știe unde vine. Dacă salvezi o adresă în cont, se păstrează și coordonatele ei.'),
      item('Eroi: drumul spre o lucrare', 'cât o lucrare este activă și Eroul a pornit spre ea, telefonul lui trimite poziția către server, în prim-plan sau în fundal. Clientul acelei lucrări vede stadiul (pe drum, aproape, a ajuns), timpul estimat și, după ce Eroul s-a îndepărtat suficient de punctul de plecare, poziția lui pe drum. Poziția nu este publică și nu apare pe profil. Pozițiile drumului se șterg după încheierea lucrării și, oricum, după cel mult 12 ore.'),
      item('Eroi care aleg „Mereu” (locație în fundal, opțional)', 'cu această opțiune, clienții din apropiere îl pot găsi pe Erou și când aplicația este închisă, iar sosirea și plecarea la lucrări se notează automat. Clienții văd doar distanța în kilometri, nu poziția pe hartă. Telefonul trimite o poziție nouă doar când Eroul se deplasează câteva sute de metri; ultima poziție se păstrează cel mult 48 de ore. În locurile în care Eroul stă peste noapte se folosește doar o zonă de aproximativ 600 m, niciodată adresa, iar aceste zone se păstrează cel mult 60 de zile.'),
      item('Eroi: sosirea și plecarea la lucrare (pontaj)', 'se păstrează doar ora sosirii și a plecării la adresa lucrării, nu traseul. Le văd Eroul, șeful echipei din care face parte și clientul lucrării respective.'),
      item('Oprire', 'Eroul alege sau oprește „Mereu” din aplicație (Cont → Locația), iar oricine poate retrage permisiunea de localizare din setările telefonului. Pe Android, cât localizarea rulează în fundal, telefonul afișează o notificare.'),
      item('Ce nu facem', 'nu vindem datele de locație, nu le folosim pentru publicitate și nu le transmitem altor persoane decât celor descrise mai sus.'),
    ],
  },

  { kind: 'h', text: '4. Temei, furnizori și păstrare' },
  { kind: 'p', parts: ['Prelucrarea se bazează, după caz, pe executarea serviciului solicitat, obligații legale, interes legitim pentru securitate și prevenirea fraudei sau consimțământ. Pentru localizare, temeiul este consimțământul dat prin permisiunea telefonului, care poate fi retras oricând. Folosim furnizori de găzduire, plăți, email și notificări numai cât este necesar funcționării serviciului. Căutarea adreselor în aplicație folosește serviciul OpenStreetMap Nominatim, căruia i se transmite textul adresei căutate.'] },
  { kind: 'p', parts: ['Datele de cont sunt păstrate cât timp contul este activ. La ștergere, datele operaționale sunt șterse sau anonimizate, iar evidențele de plată, comision, securitate și audit pot fi păstrate atât cât impun obligațiile legale ori apărarea unui drept.'] },

  { kind: 'h', text: '5. Drepturile tale' },
  { kind: 'p', parts: ['Ai dreptul la informare, acces, rectificare, ștergere, restricționare, opoziție și portabilitate, în condițiile legii. Poți depune și o plângere la autoritatea competentă pentru protecția datelor.'] },

  { kind: 'h', text: '6. Summary in English (location data)' },
  { kind: 'p', parts: ['Superfix accesses the device LOCATION only after the user grants the operating-system permission. Customers: location is used to show nearby tradespeople and distances; it is sent with that search only and is not stored in the account. The address and coordinates of a job request are stored with the request. Tradespeople: while a job is active and they are on their way, the app sends their location (foreground or background) so that the customer of that job sees the trip status, the estimated arrival and, later on the trip, the position; trip locations are deleted when the job ends and after 12 hours at most. Tradespeople who opt in to “Always” (background location) can be found by nearby customers while the app is closed (customers see only the distance in km) and have their arrival and departure at job sites recorded automatically; the last position is kept for at most 48 hours, overnight places only as an area of about 600 m for at most 60 days, and job arrival/departure times are kept with the job. Location data is never sold, used for advertising or shared beyond the people described here. Permission can be withdrawn at any time in the app (Account → Location) or in the phone settings.'] },
];
