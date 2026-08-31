# Contractul de backend pentru aplicația nativă (SuperfixApp)

Document scris pe 31 aug 2026, pe baza codului real din `server/*.ts` (nu din
presupuneri) — fiecare rută de mai jos a fost citită direct în sursă înainte
de a fi scrisă aici. Backend-ul live e la `https://api.super-fix.ro`.

**Ce NU e în documentul ăsta:** panoul de admin (login admin, TOTP, trepte de
acces SUPER/ADMIN/SUPPORT, creare conturi de admin, blocări, „ecranul de om"
de investigație). Acelea sunt treaba site-ului web, nu a aplicației — le fac
separat. Dacă ceva din ce citești aici pare să aibă legătură cu admin, nu e
pentru aplicație.

**De ce există documentul:** toate rutele de mai jos sunt deja construite și
funcționale pe server, verificate azi prin citirea directă a codului — dar
front-end-ul web (`super-fix.ro`) nu le consumă pe majoritatea lor deloc.
Aplicația nativă e primul consumator real al multora dintre ele. Nu presupune
că, fiindcă nu apar undeva pe site, nu sunt gata — sunt gata, doar neatinse
de UI până acum.

---

## 1. Modelul de identitate — citește ăsta primul

Sunt DOUĂ niveluri de identitate, și ordinea dintre ele contează:

1. **Sesiunea** (`Authorization: Bearer <token>`) — cine e omul, după login
   real (Google/Apple/cod email/parolă). Câștigă mereu, dacă există.
2. **Tokenul de dispozitiv** (`X-Device-Token: <token>`) — cine e telefonul,
   fără login. Legat de un „cont fantomă" (`Client` fără parolă, fără email)
   creat automat când omul trimite prima cerere fără cont. Nu expiră
   niciodată. NU e mecanism de blocare — blocarea abuzului se face pe numărul
   de telefon, nu pe token (dacă omul reinstalează, primește alt token).

**Regula:** dacă există sesiune, dispozitivul nici nu se mai consultă pentru
identitate. Abia fără sesiune, un dispozitiv legat de un cont devine
identitatea cererii (rutele de mesagerie, de ex., funcționează și așa —
vezi §4).

Rolurile posibile: `CLIENT`, `HERO` (admin e alt roi, exclus din documentul
ăsta). Un cont poate fi doar unul din ele.

### Pasul 0, mereu primul: token de dispozitiv

```
POST /api/device
Body: { "platform": "ios" | "android" | "web" }
→ 201 { "token": "...", "reused": false }
```

Aplicația cere asta o singură dată, la prima pornire, și salvează tokenul
local (keychain/keystore, nu doar storage simplu — nu expiră niciodată, deci
merită protejat). La pornirile următoare, dacă tokenul salvat local există,
NU se mai cere unul nou — se trimite direct pe `X-Device-Token` la orice
cerere care-l acceptă. Dacă serverul primește un `X-Device-Token` deja
cunoscut, întoarce `{ reused: true }` cu ACELAȘI token (idempotent, sigur de
reîncercat la eroare de rețea).

Limitat pe IP — un abuz de reîncercare nu creează mii de dispozitive.

---

## 2. Login — patru căi, toate duc în ACELAȘI cont

Regula de aur din spatele codului (`server/identity.ts`, funcția
`linkIdentity`): niciuna din căile de mai jos NU creează un cont nou lângă
unul existent. Ordinea de căutare e: (1) identitate externă deja legată de
Google/Apple, (2) cont cu emailul ăsta, (3) contul fantomă al DISPOZITIVULUI
curent (dacă a trimis deja o cerere fără cont), (4) telefonul dat explicit.
Dacă nimic nu se potrivește și n-a fost dat telefon, serverul răspunde
`409 PHONE_REQUIRED` — nu e o poartă înainte de folosirea aplicației, e
ultimul pas al unei conectări pe care omul a ales-o.

### 2a. Google Sign-In

```
POST /api/auth/oauth/google
Header: X-Device-Token (opțional, dar trimite-l dacă există — leagă istoricul)
Body: { "idToken": "<id token de la Google Sign-In SDK>", "phone": "07xxxxxxxx" (opțional) }
```

Pe nativ, obții `idToken` direct din SDK-ul Google (GoogleSignIn pentru
iOS/Android) — NU e nevoie de fluxul web cu buton/redirect, doar de
`idToken`-ul semnat. Serverul verifică semnătura prin JWKS-ul Google
(`https://www.googleapis.com/oauth2/v3/certs`), nu are nevoie de Client
Secret. **Client ID-ul pentru mobil trebuie configurat separat** pe server —
azi `GOOGLE_CLIENT_IDS` (`.env`, listă separată prin virgulă) are DOAR
Client ID-ul web (`800332298261-u6depd7fb51il1vfkn7gn0p0ui5c02fl...`). Pentru
un Client ID de iOS/Android nou (creat în Google Cloud Console pentru
aplicația nativă), trebuie ADĂUGAT la aceeași listă `GOOGLE_CLIENT_IDS`,
altfel serverul respinge tokenul cu `aud` necunoscut — anunță-mă când ai
Client ID-urile native, le adaug eu în `.env` pe VPS.

### 2b. Apple Sign-In — **nu e configurat încă pe server**

```
POST /api/auth/oauth/apple
Body: { "idToken": "<identity token de la Sign in with Apple>", "phone": "..." (opțional) }
```

Ruta există și e scrisă la fel de generic ca Google (verifică prin JWKS-ul
Apple, `https://appleid.apple.com/auth/keys`) — dar `APPLE_CLIENT_IDS` nu e
setat în `.env`, deci azi răspunde `503 PROVIDER_UNAVAILABLE`. Are nevoie de
un cont plătit Apple Developer Program ($99/an) — **neconfirmat încă dacă
există**. Pe nativ, `idToken`-ul vine din `ASAuthorizationAppleIDCredential`
la fel ca la Google — mecanismul de verificare pe server e deja gata, doar
configurarea lipsește. Nu construi fluxul ăsta până nu se confirmă contul
plătit.

### 2c. Cod pe email

```
POST /api/auth/email-code/request
Body: { "email": "..." }
→ 202 { "success": true }   (mereu, indiferent dacă emailul există — altfel
                              ruta ar spune cine e client la noi)

POST /api/auth/email-code/verify
Header: X-Device-Token (opțional)
Body: { "email": "...", "code": "123456", "phone": "..." (opțional, doar dacă serverul a cerut) }
→ 200 { token, expiresAt, role: "CLIENT", client: {...} }
→ 409 { error: "PHONE_REQUIRED" }  — retrimite ACELAȘI cod + telefonul, codul
                                      NU se consumă la acest răspuns
→ 401 { error: "CODE_INVALID" }
```

Cod de 6 cifre, valabil 10 minute, maxim 5 încercări. La `PHONE_REQUIRED`,
UI-ul trebuie să ceară telefonul FĂRĂ să trimită omul înapoi la „retrimite
cod" — se retrimite verify-ul cu codul deja introdus plus telefonul nou.

### 2d. Parolă (cont clasic vechi, mai puțin relevant pentru aplicație nouă)

```
POST /api/auth/client-login
Body: { "email": "...", "password": "..." }
→ 200 { token, expiresAt, role: "CLIENT", client: {...} }
```

Doar pentru conturi care au parolă (create prin `client-register`, dacă mai
există calea aia). Conturile fantomă (`passwordHash: null`) nu pot intra pe
aici — folosesc 2a/2b/2c.

### Sesiunea odată obținută

`{ token, expiresAt }` — pune `token` în `Authorization: Bearer <token>` la
orice rută care-l cere. Durata: 30 de zile pentru CLIENT, 7 zile pentru HERO.
`POST /api/auth/logout` (cu sesiune) revocă tokenul curent.

---

## 3. Contul clientului — „paginile de raport"

```
GET  /api/client/me                      → profilul (nume, email, telefon)
PUT  /api/client/me                      → editare profil
GET  /api/client/requests                → istoricul cererilor lui, cu erou și conversationId
DELETE /api/client/me                    → ștergere cont (anonimizare, vezi mai jos)
```

`GET /api/client/requests` e exact „pagina de raport" — istoricul complet:
status, descriere, adresă, poze înainte/după, eroul asignat, și
`conversationId` gata format (`mission:<id>`) de folosit direct la §4.
**Ruta există și funcționează, dar azi n-o consumă nimeni** — nici site-ul
web n-are ecran pentru ea (confirmat prin căutare în cod, 31 aug 2026).
Aplicația e primul loc unde chiar ar trebui să apară un ecran „Cererile
mele".

`DELETE /api/client/me`: pentru un cont fantomă (fără parolă, fără email)
merge și DOAR cu `X-Device-Token`, fără sesiune — tokenul E identitatea lui.
Pentru un cont cu proprietar (parolă sau email/Google/Apple), cere sesiune
reală. Ștergerea anonimizează rândul (nume/email/telefon șterse), dar
**conversațiile și misiunile rămân** — sunt și ale eroului, nu doar ale
clientului. Explică asta clar în ecranul de confirmare din aplicație, ca să
nu promiți „ștergem tot" quan nu e adevărat.

---

## 4. Auto-login prin link, după ce cineva trimite o cerere fără cont

Mecanismul exact pe care mi l-ai descris („dupa ce dai o cerere ... sa te
bage automat in cont"):

1. Un anonim (fără sesiune) trimite o cerere pe site sau din aplicație —
   `POST /api/request`. Serverul creează automat un cont fantomă legat de
   dispozitivul lui.
2. Serverul întoarce, DOAR pentru cazul ăsta (fără sesiune),
   `claimToken` și `claimUrl` gata compus:
   `https://super-fix.ro/app?c=<claimToken>` — un token opac, valabil 7 zile,
   o singură folosire.
3. Linkul ajunge la om (SMS-ul nu se folosește niciodată în produsul ăsta —
   decizie fixă; canalul e email, dacă există, sau afișat direct în UI ca
   buton „Deschide aplicația").
4. Când aplicația se deschide cu acel link (deep link / universal link,
   `super-fix.ro/app?c=...` sau schema custom echivalentă), aplicația:
   - citește `c` din link,
   - se asigură că are deja un `X-Device-Token` propriu (§1, pasul 0 —
     dacă aplicația abia s-a instalat, cere unul nou întâi),
   - cheamă:
     ```
     POST /api/device/claim
     Header: X-Device-Token: <tokenul dispozitivului curent>
     Body: { "claimToken": "<c din link>" }
     → 200 { "success": true }
     → 410 { error: "CLAIM_EXPIRED" }   — linkul a expirat sau a fost deja folosit
     → 409 { error: "DEVICE_TAKEN" }    — telefonul ăsta e deja legat de alt cont
     ```
   - la succes, dispozitivul curent e acum legat de contul cu istoric — dar
     **asta NU emite sesiune**. Omul are acces la conversațiile lui pe
     telefonul ăsta (prin `X-Device-Token`, ca o fantomă „cu nume"), dar
     contul devine cu adevărat „al lui" (protejat, recuperabil pe alt
     telefon) abia dacă se conectează separat prin Google/Apple/email (§2).
     Spune-i asta omului în UI: „ești în cont pe telefonul ăsta" ≠ „contul e
     protejat".

A DOUA sursă de `claimToken`, separată de cererea inițială: când un EROU
apasă „scrie-i clientului" pe o misiune și clientul are email dar n-a
instalat aplicația —
```
POST /api/missions/:id/invite   (doar erou, cu sesiune)
```
trimite automat un email către client cu exact același tip de link
(`/app?c=...`), cel mult o dată pe zi per misiune. Aplicația nu trebuie să
facă nimic în plus pentru cazul ăsta — e același `claimToken`, consumat la
fel la pasul 4 de mai sus.

**De implementat pe aplicație, azi lipsă complet:** ruta `/app` (sau
schema echivalentă de deep link) care citește `?c=`, apelul către
`POST /api/device/claim`, și ecranul „Deschide aplicația" — niciuna din
astea nu există momentan nicăieri, nici pe site, nici (presupun) pe
aplicație. Backendul e 100% gata pentru ele.

---

## 5. Mesageria — API complet, fără nicio interfață încă

Modele: `Conversation` (o pereche client-erou, sau legată de o misiune
anume) și `Message`. Rutele de mai jos merg ȘI cu sesiune reală, ȘI (pentru
CLIENT) doar cu `X-Device-Token` legat de un cont — exact ca la §3, sesiunea
câștigă dacă există.

```
POST   /api/conversations                  { heroId } SAU { serviceRequestId } → { id }
GET    /api/conversations                  → listă, cu ultimul mesaj, necitite, telefon eroului/clientului
GET    /api/conversations/:id/messages     ?after=ISO sau ?before=ISO → listă mesaje
POST   /api/conversations/:id/messages     { text, kind: "TEXT", clientNonce? } → mesajul creat
POST   /api/conversations/:id/read         → marchează citit
DELETE /api/conversations/:id              → ascunde conversația (nu o șterge, vezi mai jos)
GET    /api/notifications                  → listă notificări (tip MESSAGE, etc.)
POST   /api/notifications/:id/read         → marchează citită
```

Detalii importante pentru implementare:

- **`id`-ul conversației e un string compus**, nu un UUID simplu:
  `hero:<heroId>` (conversație directă, pornită de client din profilul unui
  erou), `mission:<serviceRequestId>` (conversație legată de o cerere
  anume — asta e `conversationId` din §3), sau `conversation:<uuid>` brut.
  Trimite-l exact așa cum vine din `GET /api/client/requests` sau din
  `GET /api/conversations` — nu-l reconstrui.
- **Un client fantomă (fără cont) NU poate porni o conversație nouă din
  senin** (`POST /api/conversations` cu `heroId`) — primește
  `401 AUTH_REQUIRED`. POATE însă continua o conversație deja deschisă
  automat de o cerere trimisă (`mission:...`). Diferența e intenționată:
  „scrie unui erou din nimic" cere cont, „continuă discuția despre cererea
  ta" nu cere.
- `clientNonce` (opțional, string 8-100 caractere) — trimite un id unic
  generat pe telefon la fiecare mesaj (nu la retrimitere identică); serverul
  e idempotent pe el, deci un mesaj trimis de două ori la o reîncercare de
  rețea nu se dublează.
- `DELETE /api/conversations/:id` ascunde conversația DOAR pentru partea
  care a șters-o (`clientDeletedAt`/`heroDeletedAt`) — dacă vine un mesaj
  nou, conversația reapare automat în ambele inbox-uri.
- Push: backendul are un hook (`sendPush`) pregătit pentru notificări push
  la mesaj nou — dacă aplicația configurează un provider de push (APNs/FCM),
  spune-mi și verificăm ce lipsește pe server ca să-l conecteze.

**De implementat pe aplicație, azi lipsă complet:** orice ecran de chat —
nici site-ul web n-are unul (decizie explicită, chatul nu se construiește pe
site — `CONT-FANTOMA.md §12/§14`). Aplicația e SINGURUL loc unde mesageria
asta trebuie să capete o interfață.

---

## 6. Despre „sisteme de securitate" — ce e relevant pentru aplicație și ce NU

Ca să nu construiți lucruri care nu vă privesc:

- **TOTP (autentificator cu cod) și treptele de acces SUPER/ADMIN/SUPPORT**
  sunt DOAR pentru panoul de admin (`pages/Admin.tsx`, oameni de la
  Superfix, nu clienți/eroi). Aplicația nu are nevoie de nimic din asta.
- **Blocarea abuzului** (telefoane/dispozitive blocate) se întâmplă automat
  pe server la `POST /api/request` — aplicația doar afișează mesajul de
  eroare pe care serverul îl întoarce dacă cineva e blocat, nu implementează
  logica de blocare ea însăși.
- **Ce chiar privește aplicația**: fiecare rută de mai sus e deja protejată
  corect pe server (rate-limit pe IP, validare, verificare de proprietate pe
  fiecare resursă). Aplicația trebuie doar să trateze corect codurile de
  eroare (`401`, `403`, `409`, `410`, `429`) și mesajele pe care le
  primește — nu să reinventeze validarea pe client.

---

## 7. Rezumat rapid — ce lipsește azi din orice UI (web sau aplicație)

Confirmat prin citirea directă a codului pe 31 aug 2026, nu din documentele
de spec:

| Zonă | Backend | UI (site web) | UI (aplicație) |
|---|---|---|---|
| Istoric cereri client (`/client/requests`) | ✅ gata | ❌ nimic | de construit |
| Auto-login prin link (`/device/claim`) | ✅ gata | ❌ nimic | de construit |
| Mesagerie (conversații/mesaje) | ✅ gata | ❌ intenționat absent | de construit |
| Google Sign-In | ✅ live (Client ID web) | ✅ live | de adăugat Client ID mobil |
| Apple Sign-In | ⚠️ cod gata, config lipsă | — | așteaptă cont plătit |

Dacă ceva din tabelul de mai sus se schimbă (ex. Apple se configurează, sau
apare un Client ID nou de Google pentru mobil), actualizez documentul ăsta —
nu presupune starea veche.
