import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
dotenv.config();
const app = express();
app.use(express.json({ limit: '50mb' }));
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.status(401).json({ message: "Lipsă token" });
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err)
            return res.status(403).json({ message: "Token invalid" });
        req.user = user;
        next();
    });
};
// === EMAIL CONFIG ===
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
});
// === SEO SITEMAP GENERATOR ===
// === SEO SITEMAP GENERATOR ===
app.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = process.env.FRONTEND_URL || 'https://superfix.ro';
        // 1. Luăm toți eroii din DB (DOAR ID-ul, fără updatedAt)
        const heroes = await prisma.hero.findMany({
            select: { id: true }
        });
        // 2. Definim paginile statice importante
        const staticPages = [
            '',
            '/register',
            '/heroes',
            '/legal'
        ];
        // 3. Construim XML-ul
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            ${staticPages
            .map((url) => {
            return `
                    <url>
                        <loc>${baseUrl}${url}</loc>
                        <changefreq>daily</changefreq>
                        <priority>0.8</priority>
                    </url>`;
        })
            .join('')}
            ${heroes
            .map((hero) => {
            return `
                    <url>
                        <loc>${baseUrl}/hero/${hero.id}</loc>
                        <lastmod>${new Date().toISOString()}</lastmod>
                        <changefreq>weekly</changefreq>
                        <priority>1.0</priority>
                    </url>`;
        })
            .join('')}
        </urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(sitemap);
    }
    catch (error) {
        console.error('Sitemap error:', error);
        res.status(500).end();
    }
});
// === MESAJE "CATERINCĂ" (Stil Superfix) ===
const FUNNY_MESSAGES = {
    // Mesaje pentru EROU (Când primește o misiune nouă)
    HERO_ALERT: [
        "Știu că probabil salvezi planeta (sau bei o cafea), dar avem o urgență!",
        "Lăsați totul jos! Cineva are nevoie de tine mai mult decât are nevoie Batman de Robin.",
        "Nu e semnalul de pe cer, dar e un mail de la Superfix. Avem treabă!",
        "Între două pauze, te rugăm să arunci un ochi aici. Un cetățean e la ananghie.",
        "Sper că ți-ai încărcat bateriile (și sculele). Misiune nouă la orizont!",
        "Ridică-te, eroule! Nu e timp de stat, țevile (sau prizele) nu se repară singure.",
        "Alertă de gradul 0! (Bine, poate gradul 1, dar tot e important). Te bagi?",
        "Apel de urgență! Dacă nu răspunzi tu, cine o să o facă? Superman e ocupat.",
        "Ai un nou dosar pe birou. Sper că ți-ai luat pelerina la tine azi.",
        "Cetățenii strigă după ajutor! E momentul tău de glorie (și de făcut bani)."
    ],
    // Mesaje pentru CLIENT (Când așteaptă răspuns)
    CLIENT_WAITING: [
        "Semnalul a fost trimis! Eroul nostru își termină probabil gogoașa și revine.",
        "Am lansat porumbelul digital. Acum așteptăm să vedem dacă eroul e disponibil.",
        "Cererea ta e pe masa eroului. Să sperăm că nu e prins în trafic intergalactic.",
        "Răbdare! Eroul nostru analizează situația tactic (și logistic).",
        "Nu intra în panică! Superfix e pe fir. Îi dăm de urmă imediat.",
        "Mesajul a ajuns! Eroul își verifică agenda între două salvări spectaculoase.",
        "Stai liniștit, nu te-am uitat. Eroul își caută cheile de la Batmobil.",
        "Conectare în curs... Eroul a primit notificarea. Așteptăm semnul lui.",
        "Sistemul nostru a alertat specialistul. Să vedem dacă acceptă provocarea!",
        "Eroul știe de tine. Acum e o chestiune de minute până răspunde."
    ],
    // Mesaje ACCEPT (Când eroul zice DA)
    MISSION_ACCEPTED: [
        "Veste bună! Eroul a zis 'DA'. Pregătește-te, ajutorul e pe drum!",
        "Avem confirmare! Eroul și-a pus centura și vine spre tine.",
        "Bingo! Misiune acceptată. Poți să respiri ușurat acum.",
        "E oficial: Eroul se ocupă de cazul tău. Rămâi pe recepție!",
        "Succes! Agentul Superfix a preluat comanda. Problema ta e ca și rezolvată.",
        "Eroul vine! Sperăm că ai cafeaua pregătită (opțional, dar recomandat).",
        "S-a rezolvat (aproape)! Eroul a confirmat intervenția.",
        "Nu mai ești singur în lupta asta. Eroul a acceptat provocarea!",
        "Start misiune! Eroul a plecat spre locația ta.",
        "Confirmare primită. Eroul nostru e gata de acțiune!"
    ],
    // Mesaje REJECT (Când eroul e ocupat)
    MISSION_REJECTED: [
        "Ghinion! Eroul e prins într-o luptă crâncenă (probabil are altă lucrare).",
        "Din păcate, eroul nostru e indisponibil momentan. Dar nu renunța!",
        "Se pare că eroul e în altă dimensiune acum. Te rugăm alege pe altcineva.",
        "Misiune refuzată. Eroul e suprasolicitat azi. Încearcă un alt specialist!",
        "Eroul a zis 'Pas' de data asta. Nu o lua personal, e doar foarte ocupat.",
        "Semnal pierdut. Eroul nu poate prelua cazul tău acum.",
        "Busy signal! Eroul are mâinile pline. Caută un alt agent în listă.",
        "Nu a fost să fie cu acest erou. Dar Liga Superfix e mare, alege altul!",
        "Eroul e indisponibil. Probabil salvează lumea în alt cartier.",
        "Refuz tactic. Eroul nu poate ajunge. Te rugăm să selectezi alt profesionist."
    ],
    // Mesaje COMPLETE (La final)
    MISSION_COMPLETED: [
        "Misiune Îndeplinită! Încă o zi, încă o problemă rezolvată.",
        "Boom! S-a rezolvat. Eroul și-a făcut treaba și a dispărut în apus.",
        "Dosar închis cu succes! Sperăm că ești mulțumit de rezultat.",
        "Victorie! Totul ar trebui să meargă brici acum. Nu uita de recenzie!",
        "Gata! Eroul a învins problema. Dacă ți-a plăcut, dă-i 5 stele!",
        "Curat, rapid, eficient. Asta înseamnă să lucrezi cu Superfix.",
        "O altă faptă bună bifată. Mulțumim că ai avut încredere în noi!",
        "Eroul a raportat succesul misiunii. Tu ce zici? Totul ok?",
        "Misiune executată! Poți să te relaxezi acum.",
        "Problema a fost neutralizată. Felicitări pentru o nouă colaborare reușită!"
    ]
};
const getRandomMsg = (type) => {
    const list = FUNNY_MESSAGES[type];
    return list[Math.floor(Math.random() * list.length)];
};
// === TEMPLATE EMAIL "DOSAR APLICAȚIE" (DESIGN FIX CA ÎN POZĂ) ===
const getSuperfixTemplate = (title, message, dataFields = {}, ctaLink, ctaText) => {
    // Construim HTML-ul pentru câmpurile de date (stil galben punctat)
    let fieldsHtml = '';
    for (const [key, value] of Object.entries(dataFields)) {
        fieldsHtml += `
        <div style="background-color: #fffbeb; border: 2px dashed #000; padding: 10px; margin-bottom: 15px; position: relative;">
            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 5px; color: #000;">${key}</div>
            <div style="font-size: 16px; font-weight: bold; color: #000; font-family: 'Courier New', monospace;">${value}</div>
        </div>`;
    }
    return `
<!DOCTYPE html>
<html>
<head>
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@900&display=swap');
    body { background-color: #f3f4f6; font-family: sans-serif; padding: 20px; }
    .container { 
        max-width: 600px; 
        margin: 0 auto; 
        background: #fff; 
        border: 4px solid #000; 
        box-shadow: 8px 8px 0 #000; 
        overflow: hidden;
    }
    .header {
        background: #fff;
        padding: 20px;
        text-align: center;
        border-bottom: 4px solid #000;
        position: relative;
    }
    /* LOGO ROSU SIMPLU (FARA FULGERE) */
    .logo-box {
        display: inline-block;
        background-color: #ef4444; /* Rosu intens */
        padding: 10px 20px;
        border: 3px solid #000;
        transform: rotate(-2deg);
        box-shadow: 3px 3px 0 #000;
    }
    .logo-text {
        color: #fff;
        font-family: 'Inter', sans-serif;
        font-weight: 900;
        font-style: italic;
        font-size: 32px;
        margin: 0;
        letter-spacing: -1px;
        line-height: 1;
    }
    
    /* STAMPILA CONFIDENTIAL */
    .stamp {
        position: absolute;
        top: 20px;
        right: 20px;
        border: 3px solid #dc2626;
        color: #dc2626;
        font-weight: bold;
        padding: 5px 10px;
        transform: rotate(15deg);
        font-family: 'Courier New', Courier, monospace;
        font-size: 14px;
        opacity: 0.7;
    }

    .content { padding: 30px; }
    
    .title {
        font-family: 'Inter', sans-serif;
        font-weight: 900;
        text-transform: uppercase;
        font-size: 24px;
        margin-bottom: 10px;
        border-bottom: 4px solid #000;
        display: inline-block;
    }

    .message {
        font-size: 16px;
        line-height: 1.6;
        color: #333;
        margin-bottom: 20px;
        font-style: italic;
    }

    .btn {
        display: block;
        width: fit-content;
        margin: 30px auto 0;
        background-color: #ef4444;
        color: #fff !important;
        text-decoration: none;
        padding: 15px 30px;
        font-weight: 900;
        text-transform: uppercase;
        border: 3px solid #000;
        box-shadow: 5px 5px 0 #000;
        font-family: sans-serif;
    }
    .btn:hover {
        background-color: #000;
        color: #fff !important;
    }

    .footer {
        background: #000;
        color: #fff;
        padding: 15px;
        text-align: center;
        font-size: 11px;
        font-family: monospace;
    }
</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-box">
                <h1 class="logo-text">SUPERFIX</h1>
            </div>
            <div class="stamp">CONFIDENȚIAL</div>
        </div>
        <div class="content">
            <h2 class="title">${title}</h2>
            <p class="message">${message}</p>
            
            ${Object.keys(dataFields).length > 0 ? `<div style="margin-top: 20px;">${fieldsHtml}</div>` : ''}

            ${ctaLink ? `<a href="${ctaLink}" class="btn">${ctaText || 'ACCESEAZĂ'}</a>` : ''}
        </div>
        <div class="footer">
            GENERAT DE CARTIERUL GENERAL SUPERFIX<br>
            Strict Secret • Numai pentru ochii tăi
        </div>
    </div>
</body>
</html>
    `;
};
async function sendEmail(to, subject, title, message, dataFields = {}, ctaLink, ctaText) {
    try {
        await transporter.sendMail({
            from: `"SuperFix HQ" <${process.env.EMAIL_USER}>`,
            to,
            subject: `📁 ${subject}`,
            html: getSuperfixTemplate(title, message, dataFields, ctaLink, ctaText)
        });
        console.log(`📧 Email trimis către ${to}`);
    }
    catch (error) {
        console.error("❌ Eroare Email:", error);
    }
}
// === AUTH ROUTES ===
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = await prisma.admin.findUnique({ where: { username } });
        if (!admin || !await bcrypt.compare(password, admin.passwordHash))
            return res.status(401).json({ message: "Credențiale invalide" });
        const token = jwt.sign({ id: admin.id, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, role: 'ADMIN' });
    }
    catch (e) {
        res.status(500).json({ error: "Server error" });
    }
});
app.post('/api/auth/hero-login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hero = await prisma.hero.findUnique({ where: { username } });
        if (!hero || !await bcrypt.compare(password, hero.passwordHash))
            return res.status(401).json({ message: "Date incorecte" });
        const token = jwt.sign({ id: hero.id, role: 'HERO', alias: hero.alias }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, role: 'HERO', heroId: hero.id });
    }
    catch (e) {
        res.status(500).json({ error: "Server error" });
    }
});
// === PUBLIC ROUTES ===
app.post('/api/apply-hero', async (req, res) => {
    try {
        // 1. Preluăm și 'message' din body
        const { name, email, phone, category, message } = req.body;
        // 2. Salvăm în baza de date inclusiv mesajul
        await prisma.heroApplication.create({ data: { name, email, phone, category, message } });
        // 3. Email Admin - Am adăugat mesajul eroului în textul emailului
        await sendEmail(process.env.EMAIL_USER, "APLICAȚIE NOUĂ", "DOSAR RECRUT", `Un nou civil vrea să devină erou! Verifică dacă are stofă de Superfix.\n\nMESAJ EROU:\n"${message || 'Niciun mesaj'}"`, { "Candidat": name, "Specializare": category, "Contact": phone });
        // Email Applicant (Rămâne neschimbat)
        await sendEmail(email, "APLICAȚIE PRIMITĂ", "STAND BY", "Salut viitorule Erou, dosarul tău a ajuns la Cartierul General. Agenții noștri îl analizează chiar acum. Dacă ai 'factorul X', te contactăm!", { "Status Curent": "ÎN AȘTEPTARE (PENDING)" });
        res.json({ success: true });
    }
    catch (error) {
        console.error(error); // E bine să vezi eroarea în consolă dacă apare
        res.status(500).json({ error: "Eroare aplicare" });
    }
});
// === ADMIN ROUTES ===
app.get('/api/admin/applications', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN')
        return res.status(403).json({ error: "Forbidden" });
    const apps = await prisma.heroApplication.findMany({ orderBy: { date: 'desc' } });
    res.json(apps);
});
app.delete('/api/admin/applications/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN')
        return res.status(403).json({ error: "Forbidden" });
    try {
        const appId = req.params.id;
        // 1. Căutăm aplicația înainte să o ștergem (ca să avem email-ul)
        const application = await prisma.heroApplication.findUnique({
            where: { id: appId }
        });
        if (application) {
            // 2. Trimitem email de respingere
            await sendEmail(application.email, "STATUS APLICAȚIE", "DOSAR RESPINS", `Salut ${application.name}, mulțumim pentru interesul acordat Ligii Superfix. Din păcate, în acest moment profilul tău nu corespunde cu nevoile noastre operative sau locurile sunt ocupate.`, { "Status": "RESPINS (REJECTED)", "Motiv": "Selecție competitivă" }, `${process.env.FRONTEND_URL}/`, "ÎNAPOI LA SITE");
            // 3. Ștergem aplicația din baza de date
            await prisma.heroApplication.delete({ where: { id: appId } });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Delete failed" });
    }
});
app.post('/api/heroes', authenticateToken, async (req, res) => {
    try {
        const { username, alias, password, email, ...rest } = req.body;
        const existing = await prisma.hero.findUnique({ where: { username } });
        if (existing)
            return res.status(400).json({ error: "Username luat!" });
        const plainPassword = password || "Hero123!";
        const passwordHash = await bcrypt.hash(plainPassword, 10);
        const trustFactor = rest.trustFactor || 50;
        await prisma.hero.create({
            data: { username, alias, passwordHash, email, trustFactor, missionsCompleted: 0, ...rest }
        });
        if (email) {
            await sendEmail(email, "BINE AI VENIT!", "DOSAR APROBAT", `Salut ${alias}, ai fost recrutat oficial! Cu o putere mare vine și o responsabilitate mare (și facturi plătite la timp).`, { "User": username, "Parola": plainPassword }, `${process.env.FRONTEND_URL}/portal`, "ACCESEAZĂ PORTALUL");
        }
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: "DB Error" });
    }
});
app.put('/api/heroes/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN')
        return res.status(403).json({ error: "Forbidden" });
    try {
        const dataToUpdate = { ...req.body };
        if (dataToUpdate.password) {
            dataToUpdate.passwordHash = await bcrypt.hash(dataToUpdate.password, 10);
            delete dataToUpdate.password;
        }
        else {
            delete dataToUpdate.password;
        }
        delete dataToUpdate.id;
        delete dataToUpdate.reviews;
        delete dataToUpdate.requests;
        delete dataToUpdate.createdAt;
        delete dataToUpdate.updatedAt;
        const updated = await prisma.hero.update({ where: { id: req.params.id }, data: dataToUpdate });
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: "Update failed" });
    }
});
app.delete('/api/heroes/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN')
        return res.status(403).json({ error: "Forbidden" });
    try {
        await prisma.hero.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: "Delete failed" });
    }
});
app.get('/api/heroes', async (req, res) => {
    const heroes = await prisma.hero.findMany({ include: { reviews: true } });
    res.json(heroes);
});
app.get('/api/heroes/:id', async (req, res) => {
    const hero = await prisma.hero.findUnique({ where: { id: req.params.id }, include: { reviews: true } });
    res.json(hero || {});
});
// === SERVICE REQUESTS & MISSIONS ===
// 1. Client trimite cerere (SOS)
app.post('/api/request', async (req, res) => {
    const { heroId, clientName, clientPhone, clientEmail, description } = req.body;
    try {
        const request = await prisma.serviceRequest.create({
            data: { heroId, clientName, clientPhone, clientEmail, description, status: 'PENDING' }
        });
        const hero = await prisma.hero.findUnique({ where: { id: heroId } });
        // Email către EROU
        if (hero?.email) {
            const randomMsg = getRandomMsg('HERO_ALERT');
            await sendEmail(hero.email, "MISIUNE NOUĂ", "COD ROSU", randomMsg, { "Cetățean": clientName, "Telefon": clientPhone, "Problema": description }, `${process.env.FRONTEND_URL}/portal`, "INTRA ÎN PORTAL");
        }
        // Email către CLIENT
        if (clientEmail) {
            const randomMsg = getRandomMsg('CLIENT_WAITING');
            await sendEmail(clientEmail, "CERERE TRIMISĂ", "CONFIRMARE", randomMsg, { "Status": "Se așteaptă răspuns", "Erou Contactat": hero?.alias || "N/A" });
        }
        res.json({ success: true, id: request.id });
    }
    catch (e) {
        res.status(500).json({ error: "Request error" });
    }
});
app.get('/api/request', authenticateToken, async (req, res) => {
    const requests = await prisma.serviceRequest.findMany({ orderBy: { date: 'desc' }, include: { hero: true } });
    res.json(requests);
});
// Dashboard Erou - Misiunile mele
app.get('/api/hero/my-missions', authenticateToken, async (req, res) => {
    const heroId = req.user.id;
    const missions = await prisma.serviceRequest.findMany({ where: { heroId }, orderBy: { date: 'desc' }, include: { hero: true } });
    res.json(missions);
});
// Update Status Misiune
app.put('/api/missions/:id/status', authenticateToken, async (req, res) => {
    const { status, photo } = req.body;
    const missionId = req.params.id;
    const heroId = req.user.id;
    try {
        const mission = await prisma.serviceRequest.findUnique({ where: { id: missionId }, include: { hero: true } });
        // NOTIFICĂRI EMAIL CĂTRE CLIENT
        if (mission?.clientEmail) {
            if (status === 'ACCEPTED') {
                const randomMsg = getRandomMsg('MISSION_ACCEPTED');
                await sendEmail(mission.clientEmail, "EROUL VINE!", "MISIUNE ACCEPTATĂ", randomMsg, { "Agent Asignat": mission.hero.alias, "Status": "ÎN DEPLASARE" });
            }
            else if (status === 'REJECTED') {
                const randomMsg = getRandomMsg('MISSION_REJECTED');
                await sendEmail(mission.clientEmail, "UPDATE MISIUNE", "EROUL INDISPONIBIL", randomMsg, {}, `${process.env.FRONTEND_URL}/heroes`, "GĂSEȘTE ALT EROU");
            }
            else if (status === 'COMPLETED') {
                const randomMsg = getRandomMsg('MISSION_COMPLETED');
                await sendEmail(mission.clientEmail, "MISIUNE ÎNDEPLINITĂ", "DOSAR ÎNCHIS", randomMsg, { "Rezultat": "SUCCES", "Erou": mission.hero.alias }, `${process.env.FRONTEND_URL}/hero/${mission.hero.id}`, "LASĂ O RECENZIE");
            }
        }
        await prisma.serviceRequest.update({
            where: { id: missionId },
            data: {
                status,
                ...(status === 'IN_PROGRESS' ? { photoBefore: photo } : {}),
                ...(status === 'COMPLETED' ? { photoAfter: photo } : {})
            }
        });
        if (status === 'COMPLETED') {
            await prisma.hero.update({ where: { id: heroId }, data: { trustFactor: { increment: 5 }, missionsCompleted: { increment: 1 } } });
        }
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: "Update error" });
    }
});
app.post('/api/reviews', async (req, res) => {
    const { heroId, clientName, rating, comment } = req.body;
    try {
        await prisma.review.create({ data: { heroId, clientName, rating, comment, date: new Date() } });
        if (rating === 5)
            await prisma.hero.update({ where: { id: heroId }, data: { trustFactor: { increment: 2 } } });
        res.json({ success: true });
    }
    catch {
        res.status(500).json({ error: "Review error" });
    }
});
app.listen(PORT, () => {
    console.log(`🚀 Server Backend "SuperFix" rulează pe portul ${PORT}`);
});
