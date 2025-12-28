import React from 'react';
import { Helmet } from 'react-helmet-async'; // <--- IMPORT ESENȚIAL PENTRU SEO

// === LAYOUT PRINCIPAL CU SEO INTEGRAT ===
const LegalLayout: React.FC<{title: string, lastUpdated: string, children: React.ReactNode}> = ({title, lastUpdated, children}) => (
    <div className="container mx-auto px-4 py-12 max-w-4xl bg-white border-4 border-black shadow-[8px_8px_0_#000] my-8">
        
        {/* === ZONA SEO AUTOMATĂ === */}
        <Helmet>
            <title>{title} | Superfix</title>
            <meta name="description" content={`Informații legale Superfix: ${title}. Ultima actualizare: ${lastUpdated}.`} />
            
            {/* Open Graph / Facebook / WhatsApp */}
            <meta property="og:title" content={`${title} | Superfix`} />
            <meta property="og:description" content={`Citește despre ${title} pe platforma Superfix.`} />
            <meta property="og:type" content="website" />
        </Helmet>

        <h1 className="text-3xl md:text-4xl font-heading mb-2 text-super-red">{title}</h1>
        <p className="text-sm text-gray-500 font-mono mb-8 border-b-2 border-gray-200 pb-4">Ultima actualizare: {lastUpdated}</p>
        <div className="prose prose-lg font-comic text-gray-800 max-w-none">
            {children}
        </div>
    </div>
);

// === PAGINILE INDIVIDUALE (Rămân neschimbate, dar acum au SEO) ===

export const Terms: React.FC = () => (
    <LegalLayout title="Termeni și Condiții de Utilizare" lastUpdated="24.05.2026">
        <h3>1. Introducere</h3>
        <p>Bun venit pe <strong>SUPERFIX</strong>. Acești termeni reglementează utilizarea platformei noastre, care conectează clienții cu prestatori de servicii independenți ("Eroi").</p>
        <p>Platforma este operată de <strong>[NUME FIRMA SRL]</strong>, cu sediul în [ADRESA SEDIU], CUI [RO...], J[.../../...].</p>

        <h3>2. Natura Serviciului (Intermediere)</h3>
        <p>Superfix acționează strict ca un <strong>intermediar tehnologic</strong>. Noi nu suntem angajatorul Eroilor și nu prestăm direct serviciile de reparații.</p>
        <ul>
            <li>Contractul de prestări servicii se încheie direct între Client și Erou.</li>
            <li>Superfix <strong>nu oferă garanții</strong> pentru calitatea lucrărilor efectuate de Eroi. Responsabilitatea legală și calitativă aparține în totalitate Eroului.</li>
            <li>Orice dispută referitoare la lucrare se rezolvă între Client și Erou.</li>
        </ul>

        <h3>3. Plăți și Costuri</h3>
        <ul>
            <li>Utilizarea platformei pentru clienți este momentan gratuită.</li>
            <li>Plata pentru serviciile prestate se face <strong>direct către Erou</strong> (Cash, Transfer, Card), conform înțelegerii dintre părți.</li>
            <li>Superfix nu procesează plățile și nu percepe comisioane din tranzacțiile directe Client-Erou.</li>
            <li>Ne rezervăm dreptul de a introduce taxe de listare sau abonamente pentru Eroi în viitor, cu notificare prealabilă.</li>
        </ul>

        <h3>4. Sistemul "Trust Factor" și Clasamentul</h3>
        <p>Pentru a menține calitatea, Superfix folosește un sistem automat de evaluare numit <strong>Trust Factor</strong>. Acesta pornește de la 50 de puncte și variază astfel:</p>
        <ul>
            <li><strong>+2 Puncte:</strong> Misiune finalizată cu succes (dovedită prin poze).</li>
            <li><strong>+2 Puncte:</strong> Recenzie de 5 stele.</li>
            <li><strong>-1 Punct:</strong> Refuzarea unei misiuni alocate.</li>
        </ul>
        <p><strong>Important:</strong> Participarea la sistemul de raportare (trimiterea pozelor Before/After) nu este obligatorie legal, dar este necesară pentru creșterea Trust Factor-ului. Refuzul de a trimite dovezi sau de a accepta misiuni va duce la scăderea scorului și, implicit, la o poziționare mai slabă în lista de Eroi sau chiar delistarea temporară.</p>

        <h3>5. Conținut și Drepturi de Autor (Poze/Video)</h3>
        <p>Prin încărcarea fotografiilor sau videoclipurilor pe platformă (ex: poze "Before/After"), utilizatorii (Clienți și Eroi):</p>
        <ul>
            <li>Declară că au dreptul să preia acele imagini și că nu încalcă intimitatea altor persoane.</li>
            <li>Acordă Superfix o <strong>licență neexclusivă, gratuită și perpetuă</strong> de a utiliza aceste materiale în scopuri de promovare, marketing și analiză internă.</li>
            <li>Superfix nu își arogă dreptul de autor asupra lucrării fizice efectuate, ci doar dreptul de utilizare asupra materialelor digitale încărcate pe platformă.</li>
        </ul>

        <h3>6. Moderare și Fraudă</h3>
        <p>Ne rezervăm dreptul de a șterge conturi, recenzii sau conținut fără preaviz dacă suspectăm activități frauduloase (ex: recenzii false, profiluri duplicate, comportament abuziv). Dorim să menținem un mediu onest și transparent.</p>
    </LegalLayout>
);

export const Privacy: React.FC = () => (
    <LegalLayout title="Politica de Confidențialitate (GDPR)" lastUpdated="24.05.2026">
        <h3>1. Operatorul de Date</h3>
        <p>Datele sunt prelucrate de <strong>[NUME FIRMA SRL]</strong>. Pentru orice solicitare GDPR, ne puteți contacta la [EMAIL SUPORT].</p>

        <h3>2. Ce date colectăm și de ce?</h3>
        <ul>
            <li><strong>Nume și Prenume:</strong> Pentru identificarea părților.</li>
            <li><strong>Număr de Telefon:</strong> Pentru a facilita legătura urgentă între Erou și Client.</li>
            <li><strong>Adresa de Email:</strong> Pentru confirmări de comenzi și notificări de sistem.</li>
            <li><strong>Adresa Intervenției:</strong> Necesară Eroului pentru a ajunge la locație.</li>
            <li><strong>Materiale Vizuale (Foto/Video):</strong> Pentru documentarea stării lucrării (Before/After) și calcularea Trust Factor-ului.</li>
        </ul>

        <h3>3. Stocarea Datelor</h3>
        <p>Datele sunt stocate pe servere situate în <strong>România (Freakhosting)</strong>, asigurând protecția conform standardelor UE.</p>
        <p>Păstrăm datele pe o perioadă nedeterminată, strict necesară pentru funcționarea contului, istoricului de servicii și îndeplinirea obligațiilor legale (ex: evidența activității pentru combaterea fraudei).</p>

        <h3>4. Drepturile Tale</h3>
        <p>Conform GDPR, ai dreptul la informare, acces, rectificare, ștergere ("dreptul de a fi uitat") și portabilitate. Poți exercita aceste drepturi printr-un email la adresa de suport.</p>
    </LegalLayout>
);

export const Cookies: React.FC = () => (
    <LegalLayout title="Politica de Cookies și Stocare Locală" lastUpdated="24.05.2026">
        <h3>1. Ce tehnologii folosim?</h3>
        <p>Superfix folosește tehnologii de stocare locală (LocalStorage) și, posibil, module cookie pentru a asigura funcționarea corectă a aplicației.</p>

        <h3>2. Scopul Stocării</h3>
        <ul>
            <li><strong>Autentificare:</strong> Stocăm un "token" securizat pentru a te menține logat (ca Admin sau Erou). Fără acesta, ar trebui să te loghezi la fiecare click.</li>
            <li><strong>Securitate și Anti-Spam:</strong> Stocăm informații locale pentru a preveni votarea multiplă abuzivă (sistemul de recenzii unice).</li>
            <li><strong>Performanță:</strong> Reținem preferințele tale de afișare.</li>
        </ul>

        <h3>3. Gestionare</h3>
        <p>Aceste fișiere sunt strict necesare pentru funcționarea tehnică a platformei. Dacă ștergeți datele din browser (Clear Data), veți fi delogat și istoricul local de preferințe se va pierde.</p>
    </LegalLayout>
);

export const GDPR: React.FC = () => (
    <LegalLayout title="Drepturile Tale" lastUpdated="24.05.2026">
        <p>Această secțiune rezumă drepturile tale conform Regulamentului 2016/679 (GDPR).</p>
        <ul>
            <li><strong>Dreptul de acces:</strong> Poți cere o copie a datelor pe care le avem despre tine.</li>
            <li><strong>Dreptul la rectificare:</strong> Poți cere corectarea datelor greșite.</li>
            <li><strong>Dreptul la ștergere:</strong> Poți cere ștergerea contului și a datelor asociate, dacă nu mai există un motiv legal pentru păstrarea lor.</li>
        </ul>
        <p>Pentru a exercita oricare dintre aceste drepturi, te rugăm să trimiți un email la <strong>[EMAIL SUPORT]</strong>.</p>
    </LegalLayout>
);
