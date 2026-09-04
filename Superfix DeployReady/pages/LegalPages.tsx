import React, { FormEvent, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from '@phosphor-icons/react';
import { LEGAL, legalIdentityParts } from '../config/legal';
import { Field } from '../components/Field';

import './legal.css';
import '../components/form.css';

const UPDATED_AT = '03.09.2026';

/* Cele patru documente se citesc unul dintr-altul: din politica de cookies
   vrei de obicei confidențialitatea, din termeni vrei drepturile. Linkurile din
   subsol te scot din pagină ca să te întorci; rândul ăsta te lasă înăuntru. */
const DOCS = [
  { to: '/preturi', short: 'Serviciu și prețuri' },
  { to: '/terms', short: 'Termeni' },
  { to: '/privacy', short: 'Confidențialitate' },
  { to: '/cookies', short: 'Cookies' },
  { to: '/gdpr', short: 'Drepturile tale' },
  { to: '/withdrawal', short: 'Retragere' },
];

const LegalLayout: React.FC<{ title: string; lastUpdated: string; children: React.ReactNode }> = ({
  title, lastUpdated, children,
}) => {
  const { pathname } = useLocation();

  return (
    <div className="pb-20 font-sans text-graphite">
      <Helmet>
        <title>{title} | Superfix</title>
        <meta name="description" content={`Informații legale Superfix: ${title}. Ultima actualizare: ${lastUpdated}.`} />
        <meta property="og:title" content={`${title} | Superfix`} />
        <meta property="og:description" content={`Citește despre ${title} pe platforma Superfix.`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <header className="mx-auto max-w-3xl px-5 pt-28 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-soft transition-colors hover:text-graphite"
        >
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Înapoi acasă
        </Link>

        <h1 className="mt-7 font-heading text-[2rem] font-bold leading-[1.08] text-graphite sm:text-[2.75rem]">
          {title}
        </h1>
        <p className="mt-3 text-sm font-semibold text-graphite-soft">
          Ultima actualizare: <span className="tabular-nums">{lastUpdated}</span>
        </p>

        <nav className="legal-tabs mt-6" aria-label="Documente legale">
          {DOCS.map(doc => (
            <Link
              key={doc.to}
              to={doc.to}
              className="legal-tab"
              aria-current={pathname === doc.to ? 'page' : undefined}
            >
              {doc.short}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 sm:px-6">
        <article className="sf-glass mt-8 rounded-[28px] p-6 sm:p-9">
          <div className="legal-body">{children}</div>
        </article>

        <p className="mt-6 px-1 text-sm leading-relaxed text-graphite-soft">
          Ai o întrebare la care textul nu răspunde? Scrie-ne la{' '}
          <a
            href={`mailto:${LEGAL.supportEmail}`}
            className="font-bold text-graphite underline decoration-super-red/45 underline-offset-2"
          >
            {LEGAL.supportEmail}
          </a>
          {' '}și îți răspunde un om.
        </p>
      </main>
    </div>
  );
};

const OperatorIdentity: React.FC = () => (
  <>
    <strong>{LEGAL.name}</strong>
    {legalIdentityParts.length ? `, ${legalIdentityParts.join(', ')}` : ''}
  </>
);

export const CompanyContact: React.FC = () => (
  <LegalLayout title="Date de contact și identificare" lastUpdated={UPDATED_AT}>
    <h3>Operatorul platformei Superfix</h3>
    <p><strong>Denumire juridică:</strong> {LEGAL.name}</p>
    <p><strong>CUI/CIF:</strong> {LEGAL.cui}</p>
    <p><strong>Nr. Registrul Comerțului:</strong> {LEGAL.registration}</p>
    <p><strong>Sediu social:</strong> {[LEGAL.city, LEGAL.address].filter(Boolean).join(', ')}</p>
    <p><strong>Email:</strong> <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a></p>
    {LEGAL.phone ? (
      <p><strong>Telefon:</strong> <a href={`tel:${LEGAL.phone.replace(/\s/g, '')}`}>{LEGAL.phone}</a></p>
    ) : null}
    <p><Link to="/terms">Înapoi la Termeni și condiții</Link>.</p>
  </LegalLayout>
);

export const Pricing: React.FC = () => (
  <LegalLayout title="Serviciul Superfix și prețurile" lastUpdated="04.09.2026">
    <h3>Serviciul comercializat</h3>
    <p>
      <OperatorIdentity /> comercializează către meseriași serviciul digital de
      publicare și administrare a unui profil profesional în platforma Superfix.
      Serviciul este denumit <strong>abonament de listare Superfix</strong>.
    </p>
    <p>Abonamentul de listare include:</p>
    <ul>
      <li>publicarea profilului profesional cu nume de prezentare, meserie, descriere, fotografii, videoclip și zone de lucru;</li>
      <li>afișarea profilului în căutările clienților din zonele selectate;</li>
      <li>primirea și administrarea solicitărilor de servicii transmise prin platformă;</li>
      <li>profil public cu recenzii verificate și indicatorul de reputație Fix-o-metru;</li>
      <li>acces la portalul de administrare a profilului și a misiunilor.</li>
    </ul>

    <h3>Preț și monedă</h3>
    <p>
      Prețul abonamentului de listare este de <strong>25,00 RON pentru o lună</strong>,
      preț total. Moneda tranzacției este RON.
    </p>
    <ul>
      <li>La reînnoirea automată, tariful este de 25,00 RON în fiecare lună, până la oprirea reînnoirii.</li>
      <li>Dacă se alege plata unică, suma de 25,00 RON acoperă o singură lună de listare și nu se efectuează automat o plată viitoare.</li>
      <li>Un cod de invitație, recruiter sau promoțional eligibil poate acorda o perioadă gratuită. Condițiile aplicabile sunt afișate în cont înainte de activare.</li>
    </ul>

    <h3>Ce nu se plătește prin Superfix</h3>
    <p>
      Accesul Clienților la platformă este gratuit. Superfix nu încasează și nu
      procesează prețul lucrărilor. Prețul, executarea și plata fiecărei lucrări
      se stabilesc direct între Client și Erou, în afara platformei Superfix.
    </p>

    <h3>Activarea și livrarea serviciului</h3>
    <p>
      Serviciul este furnizat exclusiv digital. Listarea se activează după
      confirmarea plății sau a perioadei gratuite aplicabile. Nu se livrează
      bunuri fizice și nu există taxe de transport.
    </p>

    <h3>Plată, anulare și suport</h3>
    <p>
      Plata cu cardul se realizează în pagina securizată NETOPIA Payments.
      Reînnoirea poate fi oprită din cont, iar profilul rămâne activ până la
      sfârșitul perioadei deja plătite. Detaliile complete sunt disponibile în{' '}
      <Link to="/terms">Termeni și condiții</Link>. Pentru ajutor, scrie la{' '}
      <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
    </p>
  </LegalLayout>
);

export const Terms: React.FC = () => (
  <LegalLayout title="Termeni și Condiții de Utilizare" lastUpdated={UPDATED_AT}>
    <h3>1. Introducere</h3>
    <p>Bun venit pe <strong>SUPERFIX</strong>. Acești termeni reglementează utilizarea platformei care conectează Clienții cu prestatori de servicii independenți („Eroi”).</p>
    <p>Platforma este operată de <OperatorIdentity />, cu activitate principală CAEN 7311 — activități ale agențiilor de publicitate. <Link to="/terms/date-contact">Datele complete de identificare și contact ale operatorului</Link> sunt disponibile în pagina dedicată.</p>

    <h3>2. Natura serviciului</h3>
    <p>Superfix este un intermediar tehnologic. Nu este angajatorul Eroilor și nu prestează direct lucrările solicitate prin platformă.</p>
    <ul>
      <li>Contractul pentru lucrare, prețul și condițiile de execuție se stabilesc direct între Client și Erou.</li>
      <li>Eroul răspunde pentru autorizațiile necesare, calitatea lucrării, garanții și obligațiile fiscale proprii.</li>
      <li>Superfix poate modera profiluri și poate oferi instrumente de comunicare, dar nu devine parte în contractul lucrării.</li>
    </ul>
    <p>Serviciul comercializat de <OperatorIdentity /> este publicarea și administrarea profilului profesional al Eroului în platformă, împreună cu accesul la instrumentele digitale aferente. Superfix nu vinde și nu facturează lucrarea executată de Erou.</p>

    <h3>3. Plăți și abonamentul Eroului</h3>
    <ul>
      <li>Utilizarea platformei de către Clienți este gratuită. Superfix nu încasează prețul lucrărilor și nu procesează plățile dintre Client și Erou.</li>
      <li>Contractul și plata lucrării se realizează direct între Client și Erou, în afara platformei Superfix.</li>
      <li><OperatorIdentity /> comercializează și facturează exclusiv serviciul digital de listare oferit Eroului, sub forma abonamentului Superfix.</li>
      <li>Tariful curent al listării este <strong>25,00 RON/lună</strong>, preț total. Moneda tranzacției este RON. Perioada gratuită aplicabilă și următoarea dată de plată sunt afișate înainte de activare și în contul Eroului.</li>
      <li>Abonamentul se reînnoiește lunar până când Eroul oprește reînnoirea. Orice tarif viitor diferit va fi afișat clar înainte de acceptare și nu se aplică retroactiv perioadelor deja plătite.</li>
      <li>Datele complete ale cardului sunt introduse numai în pagina securizată NETOPIA Payments. Superfix păstrează doar tokenul tehnic primit și date mascate, nu numărul complet al cardului sau codul CVV.</li>
      <li>Oprirea reînnoirii produce efecte la finalul perioadei deja plătite ori acordate gratuit, conform datei afișate în cont.</li>
    </ul>

    <h3 id="livrarea-serviciului" className="scroll-mt-28">4. Livrarea și activarea serviciului digital</h3>
    <ul>
      <li>Nu se livrează bunuri fizice și nu există costuri de transport.</li>
      <li>Listarea se activează electronic după aprobarea profilului și confirmarea plății sau a gratuității aplicabile. Confirmarea este afișată în cont și transmisă pe email.</li>
      <li>După activare, profilul devine eligibil pentru afișare în căutări, iar serviciul este furnizat pe durata indicată în cont. Disponibilitatea efectivă poate fi afectată de moderare, mentenanță ori incidente tehnice.</li>
      <li>Dacă activarea nu se confirmă, Eroul nu este taxat ca pentru un abonament activ și poate contacta <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.</li>
    </ul>

    <h3 id="anularea-abonamentului" className="scroll-mt-28">5. Anularea abonamentului și oprirea reînnoirii</h3>
    <ul>
      <li>Eroul poate opri oricând reînnoirea din pagina „Abonament” a contului, prin butonul „Oprește reînnoirea”, fără taxă de anulare.</li>
      <li>Dacă nu poate accesa contul, poate cere oprirea în scris la <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>, de pe adresa asociată contului.</li>
      <li>Profilul rămâne listat până la sfârșitul perioadei deja plătite sau gratuite, apoi este arhivat și nu se mai efectuează debitări recurente.</li>
      <li>Anularea reînnoirii nu este același lucru cu retragerea legală din contract. Pentru aceasta există <Link to="/withdrawal">pagina dedicată retragerii</Link>.</li>
    </ul>

    <h3>6. Dreptul de retragere</h3>
    <p>Dacă persoana care contractează abonamentul are, potrivit legii, calitatea de consumator, aceasta se poate retrage din contractul la distanță în termen de 14 zile de la încheiere, fără să indice un motiv. Dreptul legal nu se aplică unei persoane care contractează exclusiv în scopul activității sale profesionale; posibilitatea contractuală de oprire a reînnoirii rămâne însă disponibilă tuturor Eroilor.</p>
    <p>Retragerea poate fi transmisă prin <Link to="/withdrawal">pagina dedicată</Link>, care pregătește declarația pentru trimitere prin email, sau prin orice altă declarație neechivocă trimisă la <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>. Dacă, la cererea expresă a consumatorului, serviciul a început în perioada de retragere, poate fi datorată suma proporțională cu serviciul furnizat până la comunicarea retragerii. Rambursarea sumelor datorate se face, de regulă, prin aceeași metodă de plată, în termenul legal.</p>

    <h3>7. Gratuitate, invitații și recruiteri</h3>
    <ul>
      <li>Invitația este calificată numai după aprobarea contului invitat și validarea metodei sale de plată. Conturile duplicate, proprii, frauduloase sau anulate nu sunt eligibile.</li>
      <li>În configurația curentă, invitatul eligibil primește 12 luni gratuite, iar Eroul care invită primește o lună gratuită pentru fiecare prag de 5 invitați calificați.</li>
      <li>Un cont poate fi atribuit unui singur cod, introdus la înscriere sau oricând înainte de activarea abonamentului: fie cod de invitație, fie cod de recruiter. După activare, atribuirea nu se mai poate face.</li>
      <li>Recruiterii sunt aprobați manual. Comisionul curent este 50% din primele 6 facturi de abonament efectiv încasate pentru fiecare Erou atribuit.</li>
      <li>Lunile gratuite și plățile eșuate, anulate sau rambursate nu generează comision. Un refund sau chargeback anulează comisionul aferent.</li>
      <li>Comisioanele sunt verificate înainte de plată. Recruiterul furnizează un IBAN propriu valid și răspunde pentru obligațiile fiscale care îi revin.</li>
      <li>Valorile afișate în cont la data calificării se aplică acelui beneficiu. Superfix poate modifica programul pentru înscrieri viitoare, cu actualizarea acestor termeni.</li>
    </ul>

    <h3>8. Trust Factor și clasament</h3>
    <p>Rezultatele pot fi ordonate în principal după potrivirea specializării și zonei cu cererea Clientului, disponibilitate, Trust Factor, misiuni finalizate, recenzii și respectarea regulilor. Relevanța pentru cerere și proximitatea au o pondere mai mare decât popularitatea generală. Manipularea recenziilor sau a activității poate duce la suspendare ori delistare.</p>

    <h3>9. Conținut foto/video</h3>
    <p>Prin încărcarea materialelor, utilizatorul declară că are dreptul să le folosească și că nu încalcă drepturile ori viața privată a altor persoane. Materialele sunt folosite pentru executarea cererii, suport, prevenirea fraudei și, numai când există un temei legal adecvat, promovare.</p>

    <h3>10. Moderare, fraudă și închiderea contului</h3>
    <p>Superfix poate limita sau suspenda conturi, recompense, recenzii și conținut atunci când există indicii rezonabile de fraudă, abuz, încălcarea legii ori a acestor termeni. Datele care trebuie păstrate pentru obligații legale, plăți, securitate sau apărarea unui drept nu sunt eliminate odată cu închiderea contului.</p>

    <h3>11. Reclamații și soluționarea litigiilor</h3>
    <p>Reclamațiile privind abonamentul de listare furnizat de <OperatorIdentity /> pot fi trimise la <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>. Consumatorii eligibili pot folosi și procedura de Soluționare Alternativă a Litigiilor prin <a href="https://reclamatiisal.anpc.ro/" target="_blank" rel="noopener noreferrer">platforma oficială ANPC</a>. Litigiile privind prețul sau executarea unei lucrări contractate direct cu un Erou se soluționează cu acel prestator, deoarece Superfix nu încasează și nu facturează lucrarea.</p>

    <h3>12. Legea aplicabilă</h3>
    <p>Acești termeni sunt guvernați de legea română. Nicio prevedere nu restrânge drepturile imperative acordate consumatorilor de legislația aplicabilă.</p>
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
      <li><strong>Retrageri și reclamații:</strong> nume, email, identificatorul și data contractului, conținutul declarației, data și ora transmiterii, pentru înregistrarea cererii, confirmare și soluționare.</li>
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

const WITHDRAWAL_DECLARATION = 'Vă informez că doresc retragerea din contractul pentru abonamentul digital de listare Superfix identificat mai jos.';

export const Withdrawal: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contractId, setContractId] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preparedAt, setPreparedAt] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (name.trim().length < 2) nextErrors.name = 'Introdu numele complet.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = 'Introdu o adresă de email validă.';
    if (contractId.trim().length < 2) nextErrors.contractId = 'Introdu identificatorul abonamentului, plății sau contului.';
    if (!confirmed) nextErrors.confirmed = 'Confirmarea este necesară pentru transmiterea retragerii.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const submittedAt = new Date();
    const subject = 'Declarație de retragere din contractul Superfix';
    const body = [
      WITHDRAWAL_DECLARATION,
      '',
      `Nume: ${name.trim()}`,
      `Email: ${email.trim()}`,
      `Identificator abonament / plată / cont: ${contractId.trim()}`,
      `Data încheierii contractului: ${contractDate || 'necunoscută'}`,
      `Data pregătirii declarației: ${submittedAt.toLocaleString('ro-RO')}`,
    ].join('\n');
    setPreparedAt(submittedAt.toISOString());
    window.location.href = `mailto:${LEGAL.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <LegalLayout title="Retragere din contract" lastUpdated={UPDATED_AT}>
      <>
        <h3>Retrageți-vă din contract aici</h3>
        <p>Dacă ai calitatea legală de consumator, poți transmite online declarația de retragere din contractul pentru abonamentul Superfix. Termenul obișnuit este de 14 zile de la încheierea contractului. Formularul nu este destinat anulării lucrărilor contractate direct cu un Erou.</p>
        <p>Poți transmite aceeași declarație direct la <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>. Folosirea acestei pagini nu limitează celelalte modalități permise de lege.</p>

        {preparedAt && (
          <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle size={26} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <strong>Emailul este pregătit</strong>
              <p className="mt-1 text-sm">Apasă „Trimite” în aplicația de email ca declarația să ajungă la Superfix. Pregătit la {new Date(preparedAt).toLocaleString('ro-RO')}.</p>
            </div>
          </div>
        )}

        <form onSubmit={submit} noValidate className="mt-7 space-y-5">
            <Field
              id="withdrawal-name"
              label="Nume complet"
              autoComplete="name"
              value={name}
              error={errors.name}
              onChange={event => { setName(event.target.value); setErrors(current => ({ ...current, name: '' })); }}
            />
            <Field
              id="withdrawal-email"
              type="email"
              label="Email pentru confirmare"
              autoComplete="email"
              value={email}
              error={errors.email}
              hint="Folosește adresa asociată contului, ca să putem identifica solicitarea."
              onChange={event => { setEmail(event.target.value); setErrors(current => ({ ...current, email: '' })); }}
            />
            <Field
              id="withdrawal-contract"
              label="Identificator abonament, plată sau cont"
              value={contractId}
              error={errors.contractId}
              hint="De exemplu: ID-ul plății NETOPIA, ID-ul abonamentului sau emailul contului."
              onChange={event => { setContractId(event.target.value); setErrors(current => ({ ...current, contractId: '' })); }}
            />
            <Field
              id="withdrawal-date"
              type="date"
              label="Data încheierii contractului (dacă o cunoști)"
              value={contractDate}
              onChange={event => setContractDate(event.target.value)}
            />

            <label className="sf-consent" data-invalid={errors.confirmed ? 'true' : undefined}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[#e42e3f]"
                checked={confirmed}
                onChange={event => { setConfirmed(event.target.checked); setErrors(current => ({ ...current, confirmed: '' })); }}
              />
              <span className="text-sm leading-relaxed text-graphite-soft">{WITHDRAWAL_DECLARATION}</span>
            </label>
            {errors.confirmed && <p className="sf-field__error" role="status">{errors.confirmed}</p>}

            <button
              type="submit"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-graphite px-6 font-heading text-white transition-transform active:scale-[0.98]"
            >
              Deschide emailul și confirmă retragerea
            </button>
        </form>
      </>
    </LegalLayout>
  );
};
