import React from 'react';
import { Helmet } from 'react-helmet-async';
import { LEGAL, legalIdentityParts } from '../config/legal';

const UPDATED_AT = '13.07.2026';

const LegalLayout: React.FC<{ title: string; lastUpdated: string; children: React.ReactNode }> = ({ title, lastUpdated, children }) => (
  <div className="container mx-auto px-4 py-12 max-w-4xl bg-white border-4 border-black shadow-[8px_8px_0_#000] my-8">
    <Helmet>
      <title>{title} | Superfix</title>
      <meta name="description" content={`Informații legale Superfix: ${title}. Ultima actualizare: ${lastUpdated}.`} />
      <meta property="og:title" content={`${title} | Superfix`} />
      <meta property="og:description" content={`Citește despre ${title} pe platforma Superfix.`} />
      <meta property="og:type" content="website" />
    </Helmet>

    <h1 className="text-3xl md:text-4xl font-heading mb-2 text-super-red">{title}</h1>
    <p className="text-sm text-gray-500 font-mono mb-8 border-b-2 border-gray-200 pb-4">Ultima actualizare: {lastUpdated}</p>
    <div className="prose prose-lg font-comic text-gray-800 max-w-none">{children}</div>
  </div>
);

const OperatorIdentity: React.FC = () => (
  <>
    <strong>{LEGAL.name}</strong>
    {legalIdentityParts.length ? `, ${legalIdentityParts.join(', ')}` : ''}
  </>
);

export const Terms: React.FC = () => (
  <LegalLayout title="Termeni și Condiții de Utilizare" lastUpdated={UPDATED_AT}>
    <h3>1. Introducere</h3>
    <p>Bun venit pe <strong>SUPERFIX</strong>. Acești termeni reglementează utilizarea platformei care conectează Clienții cu prestatori de servicii independenți („Eroi”).</p>
    <p>Platforma este operată de <OperatorIdentity />. Contact: <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.</p>

    <h3>2. Natura serviciului</h3>
    <p>Superfix este un intermediar tehnologic. Nu este angajatorul Eroilor și nu prestează direct lucrările solicitate prin platformă.</p>
    <ul>
      <li>Contractul pentru lucrare, prețul și condițiile de execuție se stabilesc direct între Client și Erou.</li>
      <li>Eroul răspunde pentru autorizațiile necesare, calitatea lucrării, garanții și obligațiile fiscale proprii.</li>
      <li>Superfix poate modera profiluri și poate oferi instrumente de comunicare, dar nu devine parte în contractul lucrării.</li>
    </ul>

    <h3>3. Plăți și abonamentul Eroului</h3>
    <ul>
      <li>Utilizarea platformei pentru Clienți este gratuită, cu excepția unui cost comunicat distinct înainte de confirmarea sa.</li>
      <li>Plata lucrării se face direct către Erou și este separată de abonamentul de listare Superfix.</li>
      <li>Prețul abonamentului, perioada gratuită și următoarea dată de plată sunt afișate înainte de activare și în contul Eroului.</li>
      <li>Datele complete ale cardului sunt introduse numai în pagina securizată NETOPIA Payments. Superfix păstrează doar tokenul tehnic primit și date mascate, nu numărul complet al cardului sau codul CVV.</li>
      <li>Oprirea reînnoirii produce efecte la finalul perioadei deja plătite ori acordate gratuit, conform datei afișate în cont.</li>
    </ul>

    <h3>4. Gratuitate, invitații și recruiteri</h3>
    <ul>
      <li>Invitația este calificată numai după aprobarea contului invitat și validarea metodei sale de plată. Conturile duplicate, proprii, frauduloase sau anulate nu sunt eligibile.</li>
      <li>În configurația curentă, invitatul eligibil primește 12 luni gratuite, iar Eroul care invită primește o lună gratuită pentru fiecare prag de 5 invitați calificați.</li>
      <li>Un cont poate fi atribuit unui singur cod, introdus la înscriere: fie cod de invitație, fie cod de recruiter. Atribuirea nu se face retroactiv.</li>
      <li>Recruiterii sunt aprobați manual. Comisionul curent este 50% din primele 6 facturi de abonament efectiv încasate pentru fiecare Erou atribuit.</li>
      <li>Lunile gratuite și plățile eșuate, anulate sau rambursate nu generează comision. Un refund sau chargeback anulează comisionul aferent.</li>
      <li>Comisioanele sunt verificate înainte de plată. Recruiterul furnizează un IBAN propriu valid și răspunde pentru obligațiile fiscale care îi revin.</li>
      <li>Valorile afișate în cont la data calificării se aplică acelui beneficiu. Superfix poate modifica programul pentru înscrieri viitoare, cu actualizarea acestor termeni.</li>
    </ul>

    <h3>5. Trust Factor și clasament</h3>
    <p>Superfix poate folosi indicatori precum misiuni finalizate, recenzii și respectarea regulilor pentru ordonarea profilurilor. Manipularea recenziilor sau a activității poate duce la suspendare ori delistare.</p>

    <h3>6. Conținut foto/video</h3>
    <p>Prin încărcarea materialelor, utilizatorul declară că are dreptul să le folosească și că nu încalcă drepturile ori viața privată a altor persoane. Materialele sunt folosite pentru executarea cererii, suport, prevenirea fraudei și, numai când există un temei legal adecvat, promovare.</p>

    <h3>7. Moderare, fraudă și închiderea contului</h3>
    <p>Superfix poate limita sau suspenda conturi, recompense, recenzii și conținut atunci când există indicii rezonabile de fraudă, abuz, încălcarea legii ori a acestor termeni. Datele care trebuie păstrate pentru obligații legale, plăți, securitate sau apărarea unui drept nu sunt eliminate odată cu închiderea contului.</p>
  </LegalLayout>
);

export const Privacy: React.FC = () => (
  <LegalLayout title="Politica de Confidențialitate (GDPR)" lastUpdated={UPDATED_AT}>
    <h3>1. Operatorul de date</h3>
    <p>Datele sunt prelucrate de <OperatorIdentity />. Solicitările privind datele personale pot fi trimise la <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.</p>

    <h3>2. Datele prelucrate și scopurile</h3>
    <ul>
      <li><strong>Identitate și contact:</strong> nume, email, telefon și adresă, pentru cont, solicitări și comunicarea dintre părți.</li>
      <li><strong>Profil profesional:</strong> specializări, zone, descriere, tarife și materiale de profil, pentru publicarea și administrarea profilului Eroului.</li>
      <li><strong>Cereri, mesaje și imagini:</strong> pentru executarea solicitărilor, conversații, notificări, suport și soluționarea incidentelor.</li>
      <li><strong>Securitate și dispozitiv:</strong> sesiuni, jurnale de audit și tokenuri push, pentru autentificare, notificări și prevenirea fraudei.</li>
      <li><strong>Facturare:</strong> starea plăților, identificatori de tranzacție, token tehnic și date mascate ale cardului. NETOPIA Payments colectează direct datele complete ale cardului; Superfix nu le stochează.</li>
      <li><strong>Recruiteri:</strong> codul, atribuirile, comisioanele și IBAN-ul necesar plății. IBAN-ul este criptat în baza de date și este disponibil numai persoanelor autorizate pentru operațiuni.</li>
    </ul>

    <h3>3. Temei, furnizori și păstrare</h3>
    <p>Prelucrarea se bazează, după caz, pe executarea serviciului solicitat, obligații legale, interes legitim pentru securitate și prevenirea fraudei sau consimțământ. Folosim furnizori de găzduire, plăți, email și notificări numai cât este necesar funcționării serviciului.</p>
    <p>Datele de cont sunt păstrate cât timp contul este activ. La ștergere, datele operaționale sunt șterse sau anonimizate, iar evidențele de plată, comision, securitate și audit pot fi păstrate atât cât impun obligațiile legale ori apărarea unui drept.</p>

    <h3>4. Drepturile tale</h3>
    <p>Ai dreptul la informare, acces, rectificare, ștergere, restricționare, opoziție și portabilitate, în condițiile legii. Poți depune și o plângere la autoritatea competentă pentru protecția datelor.</p>
  </LegalLayout>
);

export const Cookies: React.FC = () => (
  <LegalLayout title="Politica de Cookies și Stocare Locală" lastUpdated={UPDATED_AT}>
    <h3>1. Tehnologii folosite</h3>
    <p>Superfix folosește stocarea locală ori de sesiune și poate folosi module cookie strict necesare funcționării site-ului.</p>

    <h3>2. Scop</h3>
    <ul>
      <li><strong>Autentificare:</strong> păstrarea temporară a sesiunii. Portalul recruiter folosește stocarea de sesiune a browserului.</li>
      <li><strong>Securitate:</strong> protecție anti-abuz și păstrarea stării necesare fluxului solicitat.</li>
      <li><strong>Preferințe și performanță:</strong> memorarea opțiunilor tehnice ale interfeței.</li>
    </ul>

    <h3>3. Gestionare</h3>
    <p>Ștergerea datelor browserului închide sesiunea și elimină preferințele locale. Orice tehnologie opțională de analiză sau marketing trebuie activată numai conform alegerii tale, atunci când este aplicabil.</p>
  </LegalLayout>
);

export const GDPR: React.FC = () => (
  <LegalLayout title="Drepturile Tale" lastUpdated={UPDATED_AT}>
    <p>Această secțiune rezumă drepturile prevăzute de Regulamentul (UE) 2016/679.</p>
    <ul>
      <li><strong>Acces:</strong> poți cere confirmarea prelucrării și o copie a datelor tale.</li>
      <li><strong>Rectificare:</strong> poți cere corectarea sau completarea datelor.</li>
      <li><strong>Ștergere ori restricționare:</strong> poți formula o cerere, sub rezerva obligațiilor legale de păstrare.</li>
      <li><strong>Opoziție și portabilitate:</strong> se aplică în situațiile prevăzute de lege.</li>
    </ul>
    <p>Pentru exercitarea drepturilor, scrie la <strong>{LEGAL.supportEmail}</strong>. Pentru protecția contului, putem cere verificarea identității.</p>
  </LegalLayout>
);
