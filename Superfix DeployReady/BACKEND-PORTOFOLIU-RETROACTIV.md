# Publicare retroactivă în portofoliu — endpoint nou

Document pentru cine lucrează pe `server/`. Scris din frontend pe 2026-08-25, după
citirea codului actual din `server/server.ts`. **Nu am atins backend-ul** — doar
citit, ca de obicei.

**Ce lipsește:** eroul poate acum, din editorul „Cine e sub costum", să aleagă ce
misiuni apar în portofoliul public (frontend gata, vezi `pages/HeroOriginEditor.tsx`,
secțiunea „Portofoliul tău public"). Dar butonul funcționează doar pentru misiuni
finalizate **de acum înainte**, pentru că un `PortfolioItem` se creează automat doar
în momentul finalizării (`PUT /api/missions/:id/status`, `server/server.ts:1528-1549`),
și doar dacă frontend-ul trimite `publishToPortfolio: true` chiar atunci.

Pentru misiunile deja terminate **înainte** de acest update nu există niciun
`PortfolioItem` — și re-apelarea rutei de status nu ajută, pentru că se oprește
mai devreme la verificarea idempotentă:

```ts
// server/server.ts:1485
if (mission.status === status) return res.json({ success: true, duplicate: true });
```

O misiune deja `COMPLETED` la care i se cere din nou `status: 'COMPLETED'` se
oprește aici, înainte să ajungă la blocul care creează `PortfolioItem`. Deci în UI
misiunile vechi apar gri, cu eticheta „Nepublicată", fără nicio acțiune posibilă.

**Ce trebuie adăugat:** o rută nouă, dedicată, care nu trece prin fluxul de
schimbare-de-status — doar creează/reactivează `PortfolioItem` pentru o misiune
deja terminată, aparținând eroului logat.

---

## Rută propusă

`POST /api/hero/portfolio/publish` — simetrică cu cea care există deja,
`POST /api/hero/portfolio/:id/retract` (`server/server.ts:2025-2038`).

Body: `{ missionId: string }`.

Reguli, în ordine:
1. `req.user.role === 'HERO'` (ca toate rutele din secțiunea asta).
2. Misiunea există și `mission.heroId === req.user.id` — eroul nu poate publica
   misiunea altcuiva.
3. `mission.status === 'COMPLETED'` — nu se publică o misiune neterminată.
4. `mission.photoBefore` **și** `mission.photoAfter` există — `PortfolioItem.beforeUrl`
   și `.afterUrl` sunt obligatorii în schema Prisma (`schema.prisma:283-284`, fără
   `?`). O misiune finalizată fără poza de „înainte" (posibil dacă eroul a sărit
   pasul `IN_PROGRESS`) **nu poate fi publicată deloc**, nici cu ruta asta — nu e o
   limitare artificială, e o coloană obligatorie în baza de date.

Dacă toate trec, `upsert` pe `missionId` (unic în schema, `schema.prisma:282`):
creează `PortfolioItem` dacă nu există, sau îl readuce la `APPROVED` dacă eroul îl
retrăsese anterior (`reviewStatus: 'REMOVED'`) și acum vrea să-l publice din nou.

```ts
// Eroul publică retroactiv o misiune deja finalizată, fără PortfolioItem
// sau retrasă anterior. Simetric cu /api/hero/portfolio/:id/retract de mai jos.
app.post('/api/hero/portfolio/publish', authenticateToken, async (req: any, res: Response) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    const missionId = String(req.body?.missionId || '');
    if (!missionId) return res.status(400).json({ error: 'MISSION_ID_REQUIRED' });
    try {
        const mission = await prisma.serviceRequest.findUnique({
            where: { id: missionId },
            include: { hero: true },
        });
        if (!mission) return res.status(404).json({ error: 'MISSION_NOT_FOUND' });
        if (mission.heroId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        if (mission.status !== 'COMPLETED') {
            return res.status(409).json({ error: 'MISSION_NOT_COMPLETED' });
        }
        if (!mission.photoBefore || !mission.photoAfter) {
            return res.status(409).json({
                error: 'PHOTOS_MISSING',
                message: 'Lipsește poza de dinainte sau de după — misiunea asta nu poate fi publicată.',
            });
        }
        const item = await prisma.portfolioItem.upsert({
            where: { missionId },
            update: {
                reviewStatus: 'APPROVED',
                reviewedAt: null,
                reviewReason: null,
                consentAt: new Date(),
            },
            create: {
                heroId: req.user.id,
                missionId,
                beforeUrl: mission.photoBefore,
                afterUrl: mission.photoAfter,
                title: 'Lucrare finalizată',
                category: mission.hero.category,
                completedAt: mission.updatedAt,
                reviewStatus: 'APPROVED',
                consentAt: new Date(),
                requestedByHeroId: req.user.id,
            },
        });
        res.json({ success: true, item });
    } catch (e) {
        console.error('hero portfolio publish error:', e);
        res.status(500).json({ error: 'PORTFOLIO_PUBLISH_ERROR' });
    }
});
```

Loc recomandat: imediat lângă rutele surori, între `GET /api/hero/portfolio`
(`server/server.ts:2009-2022`) și `POST /api/hero/portfolio/:id/retract`
(`server/server.ts:2025-2038`) — toate trei operează pe același model, din
perspectiva eroului.

`completedAt: mission.updatedAt` e o aproximare: `ServiceRequest` nu are un câmp
dedicat „dată de finalizare", iar `updatedAt` se actualizează la tranziția de
status către `COMPLETED`. Nu e perfect (orice altă modificare ulterioară a
rândului ar muta și data asta), dar e mai aproape de adevăr decât `mission.date`
(data cererii, nu a finalizării) sau `new Date()` (data publicării, nu a lucrării).

---

## Ce trebuie schimbat și în frontend, după ce ruta există

În `services/dataService.ts`, lângă `retractPortfolioItem`, o funcție simetrică:

```ts
export const publishPortfolioItem = async (missionId: string): Promise<boolean> => {
    try {
        const res = await fetch(`${API_URL}/hero/portfolio/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ missionId }),
        });
        return res.ok;
    } catch { return false; }
};
```

Și în `pages/HeroOriginEditor.tsx`, secțiunea „Portofoliul tău public”: pentru
lucrările fără `PortfolioItem` (afișate acum ca „Nepublicată”, fără acțiune),
un buton activ care cheamă `publishPortfolioItem(m.id)` — dar **doar dacă**
misiunea are ambele poze (`m.beforeUrl && m.afterUrl` din `draft.missions`; dacă
lipsește vreuna, butonul rămâne dezactivat, cu un mesaj scurt, ca eroul să
înțeleagă de ce, nu doar că nu merge).

Nu am scris încă partea asta de frontend — depinde de ruta de mai sus să existe
întâi, ca să am ce apela.

---

## Ce n-am putut verifica de aici

Nu am acces la baza de date de producție, deci nu știu câte misiuni vechi au
efectiv ambele poze (`photoBefore` + `photoAfter`) — posibil ca o parte din
misiunile foarte vechi să nu le aibă pe niciuna, dacă poza nu era obligatorie la
vremea aia. Ruta de mai sus le exclude corect (`PHOTOS_MISSING`), dar merită
verificat pe eșantion cât de multe rămân efectiv eligibile, ca să nu fie o
funcție care „nu face nimic" pentru majoritatea eroilor vechi.
