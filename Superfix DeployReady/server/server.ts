import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Redis } from 'ioredis';
import cron from 'node-cron';
import { createAuth } from './auth.js';
import type { AuthRequest } from './auth.js';
import { createOnboardingInvite, registerAccountRoutes } from './accounts.js';
import { createNotification, ensureMissionConversation, registerMessagingRoutes } from './messaging.js';
import { attributeGrowthCodes, registerGrowthRoutes } from './growth.js';
import { registerBillingRoutes } from './billing.js';
import { hashOpaqueToken, isAllowedMediaUrl, normalizeCode, normalizeEmail, normalizePhone, randomOpaqueToken } from './security-utils.js';
import { publicHeroSelect, publicHeroProfileSelect } from './hero-dto.js';
import { validateRuntimeConfig } from './runtime-config.js';
import { queueEmail, processEmailOutbox, registerEmailOutboxRoutes } from './email-outbox.js';
import type { EmailPayload } from './email-outbox.js';
import { registerPasswordResetRoutes } from './password-reset.js';
import { AUDIT, clientIp, writeAudit, writeAuditSync } from './audit.js';
import { checkDeviceAllowed, checkPhoneAllowed, registerAbuseRoutes } from './abuse.js';
import type { PhoneWarning } from './abuse.js';
import { issueClaimToken, registerIdentityRoutes } from './identity.js';
import { checkAdminTotp, registerTotpRoutes } from './totp.js';
import { makeAdminAccessGuard, registerAdminAccountRoutes } from './admins.js';
import { linkDeviceToClient, makeDeviceIdentity, makeDeviceMiddleware, registerDeviceRoutes } from './device.js';
import type { DeviceRequest } from './device.js';
// Nodemailer a fost eliminat; folosim un API HTTP pentru emailuri.
// Dacă runtime-ul tău nu are fetch, instalează node-fetch și importă-l aici.
// import fetch from 'node-fetch';

// Cale absolută către .env (independent de cwd/pm2) + override, ca fișierul să fie
// mereu sursa de adevăr. Fără asta, un restart pm2 fără mediu încărcat pica serverul.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), override: true });
validateRuntimeConfig();

// Sentry: activ DOAR dacă e configurat SENTRY_DSN (altfel inert, fără efect).
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    });
    console.log('🛰️  Sentry activ.');
}

const app = express();
app.set('trust proxy', 1);
// Security headers. CSP dezactivat: e API + servește un fallback HTML minimal cu meta injectate.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// Request-id pentru corelarea logurilor (propagat în header + folosit la erori 5xx).
app.use((req: any, res, next) => {
    req.id = String(req.headers['x-request-id'] || crypto.randomUUID());
    res.setHeader('X-Request-Id', req.id);
    next();
});
app.use(express.json({
    limit: '2mb',
    verify: (req: any, _res, buffer) => {
        req.rawBody = buffer.toString('utf8');
    },
}));
const prisma = new PrismaClient();
const auth = createAuth(prisma);
const authenticateToken = auth.authenticateToken;
const optionalAuthenticateToken = auth.optionalAuthenticateToken;
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://super-fix.ro').replace(/\/+$/, '');

const frontendUrl = (pathName = '/') => {
    const pathWithSlash = pathName.startsWith('/') ? pathName : `/${pathName}`;
    return `${FRONTEND_URL}${pathWithSlash}`;
};

const makeHeroSlug = (alias: string) => {
    const base = alias.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'erou';
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
};

const escapeHtml = (value: unknown) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const allowedOrigins = [
    "https://www.super-fix.ro",
    "https://super-fix.ro",
    "http://localhost:3000",
    "http://localhost:5173",
    ...(process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean),
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    // X-Device-Token: fără el aici, preflight-ul de pe site pică și NICIO cerere
    // din browser nu mai ajunge la server (CONT-FANTOMA.md §4).
    allowedHeaders: ["Content-Type", "Authorization", "Verification-token", "Idempotency-Key", "X-Device-Token"],
}));

app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

// === JURNAL DE APELURI API („developer mode" din admin) ===
// Închide fiecare cerere /api într-o înregistrare. NU păstrează corpuri, anteturi
// de autorizare sau query brut — doar ruta-ȘABLON și codul intern de eroare
// (vezi BACKEND-MEDIA-SI-JURNAL.md §5). Erorile se scriu mereu; reușitele se
// eșantionează (1/N sau dacă sunt lente). Scrierea e fire-and-forget: dacă
// jurnalul pică, cererea nu are absolut nimic de suferit.
const API_LOG_SAMPLE_RATE = Math.max(1, Number(process.env.API_LOG_SAMPLE_RATE || 50)); // 1 din N reușite
const API_LOG_SLOW_MS = Math.max(0, Number(process.env.API_LOG_SLOW_MS || 800));
const API_LOG_DISABLED = process.env.DISABLE_API_LOG === '1';
const sanitizeLogPath = (raw: string) => (raw || '')
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n')
    .slice(0, 200);
if (!API_LOG_DISABLED) app.use((req: any, res: any, next) => {
    if (!req.path.startsWith('/api/') || req.path === '/api/health/live' || req.path === '/api/health/ready') return next();
    const startNs = process.hrtime.bigint();
    // Captăm codul intern de eroare din răspuns fără să atingem corpul CERERII.
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
        if (res.statusCode >= 400 && body && typeof body.error === 'string') {
            res.locals.__errorCode = body.error.slice(0, 80);
        }
        return originalJson(body);
    };
    res.on('finish', () => {
        try {
            const status = res.statusCode;
            const durationMs = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
            const isError = status >= 400;
            // Eșantionare: erorile mereu, reușitele 1/N sau dacă depășesc pragul lent.
            if (!isError && durationMs < API_LOG_SLOW_MS && Math.random() * API_LOG_SAMPLE_RATE >= 1) return;
            // Ruta-șablon dacă am nimerit un handler real; dar catch-all-ul SPA
            // (Express 5: `/{*splat}`) nu spune nimic la depanare → calea reală, curățată.
            const routeTemplate = req.route ? `${req.baseUrl || ''}${req.route.path}` : '';
            const template = (!routeTemplate || /\*|splat/.test(routeTemplate))
                ? sanitizeLogPath(req.originalUrl || req.path)
                : routeTemplate;
            void prisma.apiLog.create({
                data: {
                    requestId: req.id ? String(req.id).slice(0, 64) : null,
                    method: req.method,
                    path: String(template).slice(0, 200),
                    status,
                    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
                    actorType: String(req.user?.role || 'ANON').slice(0, 20),
                    actorId: req.user?.id ? String(req.user.id).slice(0, 64) : null,
                    errorCode: res.locals.__errorCode || null,
                    ip: (req.ip || '').slice(0, 60) || null,
                    userAgent: String(req.headers['user-agent'] || '').slice(0, 200) || null,
                },
            }).catch(() => { /* jurnalul nu trebuie să doboare cererea */ });
        } catch { /* niciodată să nu arunce din finish */ }
    });
    next();
});

// === RATE LIMITING (anti brute-force / anti-spam) ===
// `express-rate-limit` este dependență obligatorie; limiterele sunt active în orice mediu.
// Redis pentru rate-limiting PARTAJAT între instanțele pm2 cluster (limite corecte, nu 4× mai
// lejere). Dacă REDIS_URL lipsește → in-memory per-proces (fallback). Erorile Redis nu opresc appul.
const rateLimitRedis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 })
    : null;
if (rateLimitRedis) {
    rateLimitRedis.on('error', (e: any) => console.error('Redis (rate-limit) error:', e?.message || e));
    rateLimitRedis.on('connect', () => console.log('🧠 Redis conectat (rate-limit partajat pe cluster).'));
}

// Prefix unic per limiter. Ordinea apelurilor makeLimiter e identică pe toate instanțele
// cluster => același prefix pt același limiter => contor corect partajat, dar SEPARAT între limitere.
let rlSeq = 0;
const makeLimiter = (windowMs: number, max: number, message: string) => {
    // Doar pentru load testing pe o instanță izolată (toate cererile vin de pe un IP).
    // NU se setează în producție — limiterele rămân active.
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
        return (_req: Request, _res: Response, next: express.NextFunction) => next();
    }
    const prefix = `rl${rlSeq++}:`;
    return rateLimit({
        windowMs,
        limit: max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'RATE_LIMITED', message },
        // Fail-open: dacă Redis pică, lasă cererea să treacă (nu 500) — disponibilitate > limitare strictă.
        passOnStoreError: true,
        ...(rateLimitRedis
            ? { store: new RedisStore({ prefix, sendCommand: (...args: string[]) => (rateLimitRedis.call as any)(...args) }) }
            : {}),
    });
};

// login/brute-force: 10 încercări / 15 min; formulare publice: mai lejer.
const authLimiter = makeLimiter(15 * 60 * 1000, 10, 'Prea multe încercări. Reîncearcă în câteva minute.');
const applyLimiter = makeLimiter(60 * 60 * 1000, 5, 'Prea multe aplicări. Reîncearcă mai târziu.');
const requestLimiter = makeLimiter(60 * 60 * 1000, 20, 'Prea multe cereri trimise. Reîncearcă mai târziu.');
const reviewLimiter = makeLimiter(60 * 60 * 1000, 10, 'Prea multe recenzii. Reîncearcă mai târziu.');
const messageLimiter = makeLimiter(60 * 1000, 30, 'Prea multe mesaje. Așteaptă câteva secunde.');

// === MIDDLEWARE AUTH ===
// === SEO SITEMAP GENERATOR ===
app.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = FRONTEND_URL;
        const heroes = await prisma.hero.findMany({
            where: { archived: false, deletedAt: null },
            select: { id: true, slug: true },
        });
        const staticPages = ['', '/register', '/heroes', '/legal'];
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
                .map((hero: any) => {
                    return `
                    <url>
                        <loc>${baseUrl}/hero/${hero.slug || hero.id}</loc>
                        <lastmod>${new Date().toISOString()}</lastmod>
                        <changefreq>weekly</changefreq>
                        <priority>1.0</priority>
                    </url>`;
                })
                .join('')}
        </urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(sitemap);
    } catch (error) {
        console.error('Sitemap error:', error);
        res.status(500).end();
    }
});

// === MESAJE "CATERINCĂ" (Stil Superfix) ===
const FUNNY_MESSAGES = {
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

const getRandomMsg = (type: keyof typeof FUNNY_MESSAGES) => {
    const list = FUNNY_MESSAGES[type];
    return list[Math.floor(Math.random() * list.length)];
};

// === TEMPLATE EMAIL "DOSAR APLICAȚIE" ===
// === ȘABLON EMAIL SUPERFIX ===
// Tabele + stiluri în linie: singura combinație care arată la fel în Gmail,
// Apple Mail și Outlook. Fără box-shadow, fără transform, fără @import — toate
// trei sunt ignorate exact de clientul cu cea mai mare cotă la noi (Outlook).
const getSuperfixTemplate = (
    title: string,
    message: string,
    dataFields: any = {},
    ctaLink?: string,
    ctaText?: string,
    // Textul care apare în inbox lângă subiect. Opțional și ultimul, ca apelurile
    // existente să nu se schimbe.
    preheader?: string,
) => {
    const RED = '#d6333f';
    const RED_DARK = '#b52a35';
    const INK = '#2e333b';
    const SOFT = '#5b6270';
    const LINE = '#e4e8ef';
    const PAGE = '#eef2f8';
    const HEAD = "'Anton','Arial Narrow',Arial,Helvetica,sans-serif";
    const BODY = 'Arial,Helvetica,sans-serif';

    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const safeCtaLink = ctaLink ? escapeHtml(ctaLink) : '';
    const safeCtaText = escapeHtml(ctaText || 'ACCESEAZĂ');
    // Fără preheader dat, luăm începutul mesajului — tot e mai bine decât „SUPERFIX".
    const safePre = escapeHtml((preheader || message).replace(/\s+/g, ' ').slice(0, 140));

    let rows = '';
    for (const [key, value] of Object.entries(dataFields)) {
        rows += `
              <tr>
                <td style="padding:0 0 10px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f6f8fc;border-radius:12px;">
                    <tr>
                      <td style="padding:12px 16px;font-family:${BODY};">
                        <div style="font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${SOFT};">${escapeHtml(key)}</div>
                        <div style="margin-top:4px;font-size:16px;font-weight:bold;color:${INK};word-break:break-word;">${escapeHtml(value)}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
    }

    const fieldsHtml = rows
        ? `
          <tr>
            <td style="padding:0 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}
              </table>
            </td>
          </tr>`
        : '';

    const ctaHtml = safeCtaLink
        ? `
          <tr>
            <td style="padding:12px 32px 4px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="${RED}" style="border-radius:999px;">
                    <a href="${safeCtaLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 34px;font-family:${HEAD};font-size:16px;letter-spacing:0.5px;color:#ffffff;text-decoration:none;border-radius:999px;">${safeCtaText}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <div style="font-family:${BODY};font-size:12px;line-height:1.6;color:${SOFT};">
                Dacă butonul nu se deschide, copiază adresa asta în browser:<br>
                <a href="${safeCtaLink}" style="color:${RED_DARK};word-break:break-all;">${safeCtaLink}</a>
              </div>
            </td>
          </tr>`
        : '';

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${safeTitle}</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background-color:${PAGE};">

<div style="display:none;font-size:1px;color:${PAGE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePre}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${PAGE};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:20px;overflow:hidden;">

        <tr>
          <td align="center" bgcolor="${INK}" style="padding:22px 32px;">
            <div style="font-family:${HEAD};font-size:26px;letter-spacing:2px;color:#ffffff;">SUPERFIX</div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 32px 0 32px;">
            <h1 style="margin:0;font-family:${HEAD};font-size:26px;line-height:1.15;color:${INK};">${safeTitle}</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:14px 32px 22px 32px;">
            <div style="font-family:${BODY};font-size:15px;line-height:1.65;color:${SOFT};">${safeMessage}</div>
          </td>
        </tr>
${fieldsHtml}${ctaHtml}

        <tr>
          <td style="padding:28px 32px 0 32px;">
            <div style="height:1px;background-color:${LINE};line-height:1px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td style="padding:18px 32px 30px 32px;">
            <div style="font-family:${BODY};font-size:12px;line-height:1.7;color:#8b929c;">
              Ai primit mesajul ăsta pentru că ai un cont pe Superfix.<br>
              Scrie-ne oricând la <a href="mailto:suport@superfix.ro" style="color:${SOFT};">suport@superfix.ro</a>.
            </div>
          </td>
        </tr>

      </table>
      <div style="font-family:${BODY};font-size:11px;color:#98a0ab;padding-top:16px;">Superfix &middot; meseriași verificați, în zona ta</div>
    </td>
  </tr>
</table>

</body>
</html>`;
};

async function deliverEmail({ to, subject, title, message, dataFields = {}, ctaLink, ctaText }: EmailPayload) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_USER;
    if (!apiKey || !from) throw new Error('RESEND_API_KEY/EMAIL_USER lipsesc.');
    const html = getSuperfixTemplate(title, message, dataFields, ctaLink, ctaText);
    const fieldsText = Object.entries(dataFields)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    const text = [
        title,
        '',
        message,
        fieldsText ? `\n${fieldsText}` : '',
        ctaLink ? `\n${ctaText || 'Accesează'}: ${ctaLink}` : '',
    ].join('\n');
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ from: `"SuperFix HQ" <${from}>`, to, subject: `📁 ${subject}`, html, text }),
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}: ${await response.text()}`);
}

// Notificările operaționale sunt best-effort; emailurile de acces folosesc outboxul durabil.
async function sendEmail(to: string, subject: string, title: string, message: string, dataFields: any = {}, ctaLink?: string, ctaText?: string) {
    try {
        await deliverEmail({ to, subject, title, message, dataFields, ctaLink, ctaText });
    } catch (error) {
        console.error('❌ Eroare Email:', error);
    }
}

// === PUSH NOTIFICATIONS (Expo) ===
// Trimite o notificare push către toate dispozitivele unui erou, prin Expo Push API.
// Nesincron critic: dacă pică, doar logăm (nu blocăm fluxul de request).
async function sendPush(target: { heroId?: string | null; clientId?: string | null }, title: string, body: string, data: any = {}) {
    try {
        const where = target.heroId ? { heroId: target.heroId } : target.clientId ? { clientId: target.clientId } : null;
        if (!where) return;
        const tokens = await prisma.pushToken.findMany({ where });
        if (!tokens.length) return;
        const messages = tokens.map((t) => ({
            to: t.token,
            sound: 'default',
            title,
            body,
            data,
            channelId: 'default',
        }));
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(messages),
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            console.error('❌ Expo push error:', await response.text());
        } else {
            const payload = await response.json().catch(() => null) as any;
            const tickets = Array.isArray(payload?.data) ? payload.data : [];
            const invalidTokens = tickets
                .map((ticket: any, index: number) => ticket?.details?.error === 'DeviceNotRegistered' ? tokens[index]?.token : null)
                .filter(Boolean);
            if (invalidTokens.length) await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
        }
    } catch (error) {
        console.error('❌ sendPush error:', error);
    }
}

// Modulele noi sunt separate de fișierul legacy pentru a păstra autentificarea,
// mesageria, growth-ul și facturarea testabile independent.
app.use(['/api/auth/client-register', '/api/auth/client-login', '/api/auth/recruiter-login'], authLimiter);
app.use('/api/recruiters/apply', applyLimiter);
app.use('/api/subscription/start', makeLimiter(15 * 60 * 1000, 5, 'Prea multe încercări de checkout. Reîncearcă în câteva minute.'));
app.use('/api/auth/password-reset/request', makeLimiter(15 * 60 * 1000, 3, 'Prea multe cereri de resetare. Reîncearcă mai târziu.'));
app.use('/api/auth/password-reset/complete', makeLimiter(15 * 60 * 1000, 6, 'Prea multe încercări de resetare. Reîncearcă mai târziu.'));
app.use('/api/media/sign', makeLimiter(60 * 60 * 1000, 20, 'Prea multe cereri de upload. Reîncearcă mai târziu.'));

// Dispozitivul (CONT-FANTOMA.md §6). Limiterul se creează AICI, după toate
// celelalte apeluri makeLimiter, ca prefixele Redis ale limiterelor existente
// (rl0..rl8) să rămână neschimbate după deploy.
// Middleware-ul NU e montat global: face o citire în bază, deci se pune doar pe
// rutele care chiar au nevoie de identitatea dispozitivului.
const deviceLimiter = makeLimiter(60 * 60 * 1000, 10, 'Prea multe porniri de aplicație. Reîncearcă mai târziu.');
/**
 * A doua plasă din §7, peste cota pe dispozitiv. Cota pe dispozitiv oprește omul
 * curios; pe scriptul care-și face token nou la fiecare secundă n-o simte nimeni,
 * fiindcă fiecare token nou vine cu numărul lui gratuit.
 *
 * 120/oră, nu 300: cifra din document e pragul de la care „nu mai e un cartier",
 * nu pragul de blocat. Sub CGNAT-ul operatorilor de mobil un IP chiar poate fi un
 * cartier, dar chiar și acolo un om deschide două-trei numere, deci 120 nu se
 * atinge din trafic real. Un script îl atinge în câteva secunde.
 */
const phoneRevealLimiter = makeLimiter(60 * 60 * 1000, 120, 'Prea multe numere cerute de pe conexiunea asta. Încearcă mai târziu.');
/**
 * Conectarea cu Google / Apple (§6). Apărarea aici e criptografică — semnătură,
 * `iss`, `aud` — nu numărul de cereri; limiterul e doar ca un flux de tokene
 * invalide să nu ne trimită la JWKS-ul furnizorului.
 *
 * 60/oră, în ton cu cele 120 de la numere: sub CGNAT un IP e un cartier întreg,
 * iar un prag mic ar închide un bloc de oameni care se conectează pe rând.
 */
const oauthLimiter = makeLimiter(60 * 60 * 1000, 60, 'Prea multe încercări de conectare. Reîncearcă mai târziu.');
/**
 * CEREREA codului pe email. Mult mai strâns (10/oră): fiecare apel trimite un
 * email, deci ruta e și o unealtă de bombardat inbox-ul altuia, nu doar o poartă
 * de login. Tot ea e și plafonul real împotriva ghicirii codului: ca să prinzi
 * 6 cifre cu 5 încercări per cod ai avea nevoie de zeci de mii de coduri noi.
 */
const codeLimiter = makeLimiter(60 * 60 * 1000, 10, 'Prea multe coduri cerute. Reîncearcă mai târziu.');
/**
 * VERIFICAREA codului stă separat, și mai lejer, dinadins. Pe un limiter comun,
 * omul care greșește codul de câteva ori și mai cere unul rămâne pe dinafară
 * exact când se chinuie să intre — iar ghicitul e oprit oricum de cele 5
 * încercări per cod și de limita de mai sus.
 */
const codeVerifyLimiter = makeLimiter(60 * 60 * 1000, 60, 'Prea multe încercări. Reîncearcă mai târziu.');
/**
 * Revendicarea din deep link, separată de conectare: dacă ar sta pe același
 * contor, cineva care se chinuie cu Google ar bloca instalarea aplicației
 * pentru tot IP-ul. Se apelează o dată per instalare.
 */
const claimLimiter = makeLimiter(60 * 60 * 1000, 30, 'Prea multe încercări. Reîncearcă mai târziu.');
const deviceMiddleware = makeDeviceMiddleware(prisma);
registerDeviceRoutes(app, prisma, { deviceLimiter, deviceMiddleware });

/**
 * Identitatea care acceptă și contul fantomă (§8: chat, push și istoric se
 * deschid odată cu prima cerere trimisă). Sesiunea rămâne prioritară.
 */
const deviceIdentity = makeDeviceIdentity(auth, deviceMiddleware, 'Trimite o cerere sau conectează-te ca să vezi mesajele.');
const pushIdentity = makeDeviceIdentity(auth, deviceMiddleware, 'Trimite o cerere ca să primești notificări despre ea.');

// §13: ștergerea contului trebuie să meargă și fără login. Fantoma n-are parolă,
// deci un `authenticateToken` acolo însemna „poți cere ștergerea numai dacă îți
// faci întâi cont" — exact pe dos față de ce cere legea.
// Poarta de pe TOT ce începe cu `/api/admin`: treaptă de acces, cont suspendat,
// al doilea factor obligatoriu. Montată AICI, înaintea oricărei rute de admin —
// în Express middleware-ul rulează în ordinea declarării, deci una pusă mai jos
// n-ar acoperi rutele scrise mai sus. Rutele de admin sunt împrăștiate în șase
// fișiere; asta e singura poziție din care le prinde pe toate, inclusiv pe cele
// care se vor scrie mâine.
const adminGate = makeAdminAccessGuard(prisma, auth);
app.use('/api/admin', adminGate);
registerAdminAccountRoutes(app, prisma, auth);

registerAccountRoutes(app, prisma, auth, {
    identify: makeDeviceIdentity(auth, deviceMiddleware, 'Conectează-te ca să-ți ștergi contul.'),
});
registerMessagingRoutes(app, prisma, auth, { sendPush, messageLimiter, identify: deviceIdentity });
// Raportare + listă de numere blocate (§9). Raportarea clientului merge și de pe
// cont fantomă: dacă i-am cere întâi cont, exact omul păgubit ar renunța.
registerAbuseRoutes(app, prisma, auth, {
    identify: makeDeviceIdentity(auth, deviceMiddleware, 'Trimite o cerere sau conectează-te ca să raportezi.'),
    // Emailul de la treapta a treia a scării. Trece prin outbox ca tot restul:
    // o blocare nu are voie să aștepte după furnizorul de email.
    queueEmail,
});
// Google / Apple / cod pe email + revendicarea prin deep link (§6, §12). Toate
// trei duc pe rândul `Client` care există deja, nu creează unul lângă el.
// Coada e durabilă (supraviețuiește unui Resend picat, cu reîncercare), dar
// fără asta ar aștepta până la 60s tactul cronului — insuportabil pentru un
// cod de login pe care omul îl așteaptă cu ochii pe telefon. Pornit acum,
// neașteptat (nu blochează răspunsul 202); dacă livrarea pică, rândul rămâne
// PENDING/RETRY și cronul de mai jos îl reia oricum, ca azi.
const kickEmailOutbox = () => {
    processEmailOutbox(prisma, deliverEmail).catch((error) => console.error('Email outbox (pornire imediată):', error));
};
registerIdentityRoutes(app, prisma, auth, { deviceMiddleware, oauthLimiter, codeLimiter, codeVerifyLimiter, claimLimiter, queueEmail, kickEmailOutbox, frontendUrl });
// Al doilea factor pentru admini (§10). Rutele de înrolare stau lângă panou, nu
// la login: se folosesc de pe o sesiune deja validă, cu parola cerută din nou.
registerTotpRoutes(app, prisma, auth);
registerEmailOutboxRoutes(app, prisma, auth, deliverEmail);
registerPasswordResetRoutes(app, prisma, auth, queueEmail);
registerGrowthRoutes(app, prisma, auth, { queueEmail });
registerBillingRoutes(app, prisma, auth);

app.post('/api/media/sign', optionalAuthenticateToken, async (req: AuthRequest, res) => {
    try {
        const kind = req.body?.kind === 'video' ? 'video' : req.body?.kind === 'image' ? 'image' : null;
        if (!kind) return res.status(400).json({ error: 'MEDIA_KIND_INVALID' });
        let actorId: string | null = null;
        let actorType: string | null = null;
        if (req.user && ['ADMIN', 'HERO'].includes(req.user.role)) {
            actorId = req.user.id;
            actorType = req.user.role.toLowerCase();
        } else if (req.body?.originToken) {
            // Erou venit din linkul de email „Cine e sub costum" — upload arsenal fără sesiune.
            const originHeroId = await resolveOriginToken(String(req.body.originToken));
            if (!originHeroId) return res.status(401).json({ error: 'ORIGIN_TOKEN_INVALID' });
            actorId = originHeroId;
            actorType = 'hero'; // aceleași foldere ca eroul logat (superfix/hero/{id})
        } else {
            const inviteToken = String(req.body?.onboardingToken || '');
            if (!inviteToken) return res.status(401).json({ error: 'MEDIA_AUTH_REQUIRED' });
            const invite = await prisma.onboardingInvite.findUnique({
                where: { tokenHash: hashOpaqueToken(inviteToken) },
                include: { hero: { select: { deletedAt: true } } },
            });
            if (!invite || invite.usedAt || invite.expiresAt <= new Date() || invite.hero.deletedAt) {
                return res.status(401).json({ error: 'ONBOARDING_TOKEN_INVALID' });
            }
            actorId = invite.heroId;
            actorType = 'onboarding';
        }
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        const uploadPreset = kind === 'video'
            ? process.env.CLOUDINARY_SIGNED_VIDEO_UPLOAD_PRESET
            : process.env.CLOUDINARY_SIGNED_IMAGE_UPLOAD_PRESET;
        if (!cloudName || !apiKey || !apiSecret || !uploadPreset) {
            return res.status(503).json({ error: 'MEDIA_UPLOAD_NOT_CONFIGURED' });
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const maxBytes = kind === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        const params: Record<string, string | number> = {
            allowed_formats: kind === 'video' ? 'mp4,mov,webm' : 'jpg,jpeg,png,webp,heic',
            folder: `superfix/${actorType}/${actorId}`,
            overwrite: 'false',
            public_id: crypto.randomUUID(),
            timestamp,
            upload_preset: uploadPreset,
            unique_filename: 'false',
        };
        const stringToSign = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
        const signature = crypto.createHash('sha1').update(`${stringToSign}${apiSecret}`).digest('hex');
        res.setHeader('Cache-Control', 'no-store');
        res.json({ cloudName, apiKey, resourceType: kind, timestamp, signature, params, maxBytes });
    } catch (error) {
        console.error('media/sign:', error);
        res.status(500).json({ error: 'MEDIA_SIGN_FAILED' });
    }
});

app.get('/api/health/live', (_req, res) => res.json({ ok: true }));
app.get('/api/health/ready', async (_req, res) => {
    try {
        await prisma.$queryRawUnsafe('SELECT 1');
        res.json({ ok: true, database: 'ready' });
    } catch {
        res.status(503).json({ ok: false, database: 'unavailable' });
    }
});

// === AUTH ROUTES ===
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    try {
        const admin = await prisma.admin.findUnique({ where: { username } });
        if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
            return res.status(401).json({ message: 'Credențiale invalide' });
        }
        // Cont suspendat: același loc ca parola greșită, dar mesaj propriu — omul
        // trebuie să știe că nu parola e problema, ci că i s-a luat accesul.
        if (admin.disabledAt) {
            return res.status(403).json({ error: 'ADMIN_DISABLED', message: 'Contul tău a fost suspendat. Vorbește cu administratorul principal.' });
        }
        // Al doilea factor, DUPĂ parolă (§10). Ordinea contează: verificat înainte,
        // răspunsul ar spune cine are TOTP activat, adică ar confirma un utilizator
        // valid pentru cineva care doar ghicește nume.
        const gate = await checkAdminTotp(prisma, admin, req.body?.totpCode);
        if (!gate.ok) return res.status(gate.status).json(gate.body);
        const session = await auth.issueSession({ id: admin.id, role: 'ADMIN' });
        await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } }).catch(() => { /* nu doborî conectarea pentru o dată */ });
        // Sesiunea se emite și fără al doilea factor pus, dar poarta de pe
        // `/api/admin` nu o lasă nicăieri în afară de înrolare cât timp lipsește
        // (`admins.ts`). Așa obligația e reală, fără să existe vreo stare din
        // care omul să nu mai aibă cum să se înroleze.
        res.json({
            ...session,
            role: 'ADMIN',
            adminRole: admin.role,
            totpEnabled: !!admin.totpEnabledAt,
            totpSetupRequired: !admin.totpEnabledAt && String(process.env.ADMIN_TOTP_REQUIRED ?? 'true').toLowerCase() !== 'false',
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/hero-login', authLimiter, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    try {
        const hero = await prisma.hero.findUnique({ where: { username } });
        if (!hero?.passwordHash || hero.deletedAt || !(await bcrypt.compare(password, hero.passwordHash))) {
            return res.status(401).json({ message: 'Date incorecte' });
        }
        const session = await auth.issueSession({ id: hero.id, role: 'HERO', alias: hero.alias });
        res.json({ ...session, role: 'HERO', heroId: hero.id });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// === PUSH: înregistrare token (erou sau client, inclusiv cont fantomă) ===
// §8 dă push-ul contului fantomă. `PushToken.clientId` era deja nullable, dar
// ruta cerea sesiune — deci fantoma lua 401 și nu primea nicio notificare.
app.post('/api/push/register', ...pushIdentity, async (req: any, res) => {
    try {
        if (!['HERO', 'CLIENT'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
        const { token, platform } = req.body;
        if (!token) return res.status(400).json({ error: 'Lipsă token' });
        // Un token = un singur proprietar. La reasignare (alt cont, același device) resetăm
        // celălalt câmp ca să nu rămână legat de proprietarul vechi.
        const owner = req.user.role === 'HERO'
            ? { heroId: req.user.id, clientId: null }
            : { clientId: req.user.id, heroId: null };
        await prisma.pushToken.upsert({
            where: { token },
            update: { ...owner, platform: platform || null },
            create: { token, ...owner, platform: platform || null },
        });
        res.json({ success: true });
    } catch (e) {
        console.error('push/register error:', e);
        res.status(500).json({ error: 'Push register failed' });
    }
});

// === PUBLIC ROUTES ===
app.post('/api/apply-hero', applyLimiter, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim().slice(0, 120);
        const email = normalizeEmail(req.body?.email);
        const phone = normalizePhone(req.body?.phone);
        const category = String(req.body?.category || '').trim().slice(0, 100);
        const message = String(req.body?.message || '').trim().slice(0, 5000) || null;
        const referralCode = normalizeCode(req.body?.referralCode || req.body?.ref);
        const recruiterCode = normalizeCode(req.body?.recruiterCode || req.body?.recruiter);
        if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || !/^07\d{8}$/.test(phone) || category.length < 2) {
            return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Verifică numele, emailul, telefonul și specializarea.' });
        }
        if (referralCode && recruiterCode) {
            return res.status(400).json({ error: 'ONE_CODE_ONLY', message: 'Poți folosi fie un cod de invitație, fie un cod de recruiter.' });
        }
        if (referralCode) {
            const valid = await prisma.referralCode.findFirst({ where: { code: referralCode, active: true }, select: { id: true } });
            if (!valid) return res.status(400).json({ error: 'REFERRAL_INVALID', message: 'Codul de invitație nu este valid.' });
        }
        if (recruiterCode) {
            const valid = await prisma.recruiter.findFirst({ where: { code: recruiterCode, status: 'ACTIVE' }, select: { id: true } });
            if (!valid) return res.status(400).json({ error: 'RECRUITER_INVALID', message: 'Codul de recruiter nu este valid.' });
        }
        // Duplicat la SURSĂ (nu abia la aprobare): aplicație PENDING sau erou existent
        // cu același email SAU telefon. Mesaj clar omului care poate face ceva acum.
        const dupApp = await prisma.heroApplication.findFirst({
            where: { status: 'PENDING', OR: [{ email }, { phone }] },
            select: { id: true },
        });
        if (dupApp) return res.status(409).json({ error: 'APPLICATION_EXISTS', message: 'Există deja o aplicație în analiză cu acest email sau telefon.' });
        // Eroii șterși golesc email/telefon la ștergere, deci deletedAt:null e suficient.
        const dupHero = await prisma.hero.findFirst({
            where: { deletedAt: null, OR: [{ email }, { phone }] },
            select: { email: true },
        });
        if (dupHero) {
            const which = dupHero.email === email ? 'Emailul' : 'Numărul de telefon';
            return res.status(409).json({ error: 'ALREADY_REGISTERED', message: `${which} ăsta e deja înregistrat pe Superfix. Dacă e contul tău, intră cu datele tale sau folosește recuperarea parolei.` });
        }

        await prisma.heroApplication.create({
            data: { name, email, phone, category, message, referralCode: referralCode || null, recruiterCode: recruiterCode || null },
        });

        // Email către Admin
        await sendEmail(
            process.env.EMAIL_USER as string,
            'APLICAȚIE NOUĂ',
            'DOSAR RECRUT',
            `Un nou civil vrea să devină erou! Verifică dacă are stofă de Superfix.\n\nMESAJ EROU:\n"${message || 'Niciun mesaj'}"`,
            { Candidat: name, Specializare: category, Contact: phone }
        );

        // Email către Aplicant
        await sendEmail(
            email,
            'APLICAȚIE PRIMITĂ',
            'STAND BY',
            "Salut viitorule Erou, dosarul tău a ajuns la Cartierul General. Agenții noștri îl analizează chiar acum. Dacă ai 'factorul X', te contactăm!",
            { 'Status Curent': 'ÎN AȘTEPTARE (PENDING)' }
        );

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Eroare aplicare' });
    }
});

app.post('/api/hero/public-submit-update', (_req, res) => {
    // Endpointul vechi folosea ID-ul public al eroului drept "secret" și permitea preluarea profilului.
    res.status(410).json({
        error: 'ONBOARDING_ENDPOINT_RETIRED',
        message: 'Folosește invitația securizată de onboarding sau actualizarea autentificată a profilului.',
    });
});

app.delete('/api/push/unregister', ...pushIdentity, async (req: any, res) => {
    try {
        if (!['HERO', 'CLIENT'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
        const token = String(req.body?.token || '').trim();
        if (!token) return res.status(400).json({ error: 'TOKEN_REQUIRED' });
        const owner = req.user.role === 'HERO' ? { heroId: req.user.id } : { clientId: req.user.id };
        await prisma.pushToken.deleteMany({ where: { ...owner, token } });
        res.json({ success: true });
    } catch (error) {
        console.error('push/unregister error:', error);
        res.status(500).json({ error: 'PUSH_UNREGISTER_FAILED' });
    }
});

// === ADMIN ROUTES ===
app.get('/api/admin/applications', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const requestedStatus = String(req.query?.status || 'PENDING').toUpperCase();
    const apps = await prisma.heroApplication.findMany({
        where: requestedStatus === 'ALL' ? {} : { status: requestedStatus },
        orderBy: { date: 'desc' },
        take: 1000,
    });
    res.json(apps);
});

app.delete('/api/admin/applications/:id', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const appId = req.params.id;
        await prisma.$transaction(async (tx) => {
            const application = await tx.heroApplication.findUnique({ where: { id: appId } });
            if (!application) throw new Error('APPLICATION_NOT_FOUND');
            const changed = await tx.heroApplication.updateMany({
                where: { id: appId, status: 'PENDING' },
                data: { status: 'REJECTED' },
            });
            if (changed.count !== 1) throw new Error('APPLICATION_ALREADY_PROCESSED');
            await queueEmail(tx, `hero-application-rejected:${application.id}`, {
                to: application.email,
                subject: 'STATUS APLICAȚIE',
                title: 'DOSAR RESPINS',
                message: `Salut ${application.name}, mulțumim pentru interesul acordat. În acest moment profilul nu corespunde nevoilor operative sau locurile sunt ocupate.`,
                dataFields: { Status: 'RESPINS (REJECTED)', Motiv: 'Selecție competitivă' },
                ctaLink: frontendUrl('/'),
                ctaText: 'ÎNAPOI LA SITE',
            });
            await tx.auditLog.create({ data: { actorType: 'ADMIN', actorId: req.user.id, action: 'HERO_APPLICATION_REJECTED', entityType: 'HeroApplication', entityId: appId } });
        });
        res.json({ success: true });
    } catch (error: any) {
        if (error?.message === 'APPLICATION_NOT_FOUND') return res.status(404).json({ error: error.message });
        if (error?.message === 'APPLICATION_ALREADY_PROCESSED') return res.status(409).json({ error: error.message });
        console.error(error);
        res.status(500).json({ error: 'REJECT_FAILED' });
    }
});

// `adminGate` și pe rutele astea, deși nu încep cu `/api/admin`: sunt patru rute
// de administrare rămase pe prefixul public, iar poarta montată pe `/api/admin`
// nu le atinge. Fără linia asta, un admin fără al doilea factor pus — sau unul
// de pe treapta SUPPORT, sau unul suspendat cu sesiunea încă în mână — putea să
// creeze, să modifice și să șteargă eroi și să citească toate cererile.
// Poarta merge nemodificată pe rută: `req.path` e aici calea întreagă, care nu
// se potrivește nici cu lista de autoservire, nici cu cea rezervată lui SUPER,
// deci se aplică exact ce trebuie — factorul, suspendarea și „doar citire".
app.post('/api/heroes', adminGate, authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const username = String(req.body?.username || '').trim().slice(0, 80);
        const alias = String(req.body?.alias || '').trim().slice(0, 80);
        const requestedEmail = req.body?.email ? normalizeEmail(req.body.email) : null;
        const applicationId = req.body?.applicationId ? String(req.body.applicationId) : null;
        if (username.length < 3 || alias.length < 2) {
            return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Username și alias sunt obligatorii.' });
        }
        const existing = await prisma.hero.findUnique({ where: { username } });
        if (existing) return res.status(400).json({ error: 'Username luat!' });
        const application = applicationId
            ? await prisma.heroApplication.findUnique({ where: { id: applicationId } })
            : requestedEmail ? await prisma.heroApplication.findFirst({ where: { email: requestedEmail, status: 'PENDING' }, orderBy: { date: 'desc' } }) : null;
        if (applicationId && (!application || application.status !== 'PENDING')) {
            return res.status(400).json({ error: 'APPLICATION_INVALID', message: 'Aplicația nu există sau a fost deja procesată.' });
        }
        const email = requestedEmail || application?.email || null;
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ error: 'EMAIL_REQUIRED', message: 'Emailul este obligatoriu pentru invitația securizată.' });
        }
        if ((req.body?.avatarUrl && !isAllowedMediaUrl(req.body.avatarUrl)) || (req.body?.videoUrl && !isAllowedMediaUrl(req.body.videoUrl))) {
            return res.status(400).json({ error: 'MEDIA_URL_INVALID' });
        }
        const phone = req.body?.phone ? normalizePhone(req.body.phone) : application?.phone || null;
        if (phone && !/^07\d{8}$/.test(phone)) {
            return res.status(400).json({ error: 'PHONE_INVALID', message: 'Numărul de telefon nu e valid (format 07xxxxxxxx).' });
        }
        // Duplicat email/telefon pe un erou existent → mesaj acționabil ÎNAINTE de a atinge
        // aplicația, nu eroare Prisma brută. (Eroul-fantomă neactivat e cazul clasic.)
        const clash = await prisma.hero.findFirst({
            where: {
                deletedAt: null,
                OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
            },
            select: { alias: true, email: true, archived: true, passwordHash: true },
        });
        if (clash) {
            const field = clash.email === email ? 'emailul' : 'telefonul';
            const stare = clash.archived ? ' (neactivat — îl vezi în Recrutare/Funnel: retrimite-i linkul sau șterge-l)' : '';
            return res.status(409).json({ error: 'HERO_DUPLICATE', message: `Există deja un erou (${clash.alias}) cu ${field} ăsta${stare}.` });
        }
        const safeData = {
            username,
            alias,
            slug: makeHeroSlug(alias),
            passwordHash: null,
            email,
            realName: req.body?.realName ? String(req.body.realName).trim().slice(0, 120) : application?.name || null,
            phone,
            category: String(req.body?.category || application?.category || 'Electrician').trim().slice(0, 100),
            description: String(req.body?.description || 'Profil în curs de completare.').trim().slice(0, 5000),
            powers: String(req.body?.powers || 'Experiență verificată').trim().slice(0, 1000),
            location: req.body?.location ? String(req.body.location).trim().slice(0, 150) : null,
            hourlyRate: Math.max(0, Math.min(100000, Number(req.body?.hourlyRate) || 100)),
            actionAreas: Array.isArray(req.body?.actionAreas) ? req.body.actionAreas.slice(0, 50).map((item: unknown) => String(item).slice(0, 3)) : [],
            avatarUrl: req.body?.avatarUrl && isAllowedMediaUrl(req.body.avatarUrl) ? String(req.body.avatarUrl).slice(0, 2000) : null,
            videoUrl: req.body?.videoUrl && isAllowedMediaUrl(req.body.videoUrl) ? String(req.body.videoUrl).slice(0, 2000) : null,
            trustFactor: Math.max(0, Math.min(100, Number(req.body?.trustFactor) || 50)),
            missionsCompleted: 0,
            archived: true,
            subscriptionStatus: 'NONE',
        };
        const createdWithInvite = await prisma.$transaction(async (tx) => {
            if (application) {
                const claimed = await tx.heroApplication.updateMany({
                    where: { id: application.id, status: 'PENDING' },
                    data: { status: 'APPROVING' },
                });
                if (claimed.count !== 1) throw new Error('APPLICATION_ALREADY_PROCESSED');
            }
            const created = await tx.hero.create({ data: safeData });
            await tx.billingAccount.create({ data: { heroId: created.id } });
            if (application) {
                await attributeGrowthCodes(tx, created.id, {
                    referralCode: application.referralCode,
                    recruiterCode: application.recruiterCode,
                });
                await tx.heroApplication.updateMany({ where: { id: application.id, status: 'APPROVING' }, data: { status: 'APPROVED' } });
            }
            const inviteToken = await createOnboardingInvite(tx, created.id);
            const onboardingLink = frontendUrl(`/onboarding?token=${encodeURIComponent(inviteToken)}`);
            await queueEmail(tx, `hero-onboarding:${created.id}:${crypto.createHash('sha256').update(inviteToken).digest('hex')}`, {
                to: email,
                subject: 'BINE AI VENIT!',
                title: 'DOSAR APROBAT',
                message: `Salut ${alias}, ai fost recrutat oficial! Cu o putere mare vine și o responsabilitate mare (și facturi plătite la timp).`,
                dataFields: { User: username, 'Invitație valabilă': '72 de ore', Portal: frontendUrl('/portal') },
                ctaLink: onboardingLink,
                ctaText: 'SETEAZĂ PAROLA ȘI PROFILUL',
            });
            return created;
        });
        const hero = createdWithInvite;
        await prisma.auditLog.create({ data: { actorType: 'ADMIN', actorId: req.user.id, action: 'HERO_CREATED', entityType: 'Hero', entityId: hero.id } });
        res.status(201).json({ success: true, heroId: hero.id, onboardingCreated: true, emailQueued: true });
    } catch (error: any) {
        // Cursă rară care a scăpat de verificarea de mai sus → mesaj clar, nu Prisma brut.
        if (error?.code === 'P2002') {
            const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(', ') : String(error?.meta?.target || 'câmp unic');
            return res.status(409).json({ error: 'HERO_DUPLICATE', message: `Un câmp unic (${target}) e deja folosit de alt erou. Verifică email/telefon/username.` });
        }
        if (error?.message === 'APPLICATION_ALREADY_PROCESSED') {
            return res.status(409).json({ error: 'APPLICATION_ALREADY_PROCESSED', message: 'Aplicația a fost deja procesată între timp.' });
        }
        res.status(400).json({ error: 'CREATE_HERO_FAILED', message: error?.message || 'DB Error' });
    }
});

app.put('/api/heroes/:id', adminGate, authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const dataToUpdate: any = {};
        const requiredTextFields: Record<string, { max: number; min: number }> = {
            alias: { max: 80, min: 2 }, username: { max: 80, min: 3 },
            description: { max: 5000, min: 1 }, powers: { max: 1000, min: 0 },
            category: { max: 100, min: 2 },
        };
        for (const [field, limits] of Object.entries(requiredTextFields)) {
            if (req.body?.[field] !== undefined) {
                const value = String(req.body[field] ?? '').trim().slice(0, limits.max);
                if (value.length < limits.min) return res.status(400).json({ error: 'VALIDATION_ERROR', message: `${field} este invalid.` });
                dataToUpdate[field] = value;
            }
        }
        const nullableTextFields: Record<string, number> = { realName: 120, location: 150, avatarUrl: 2000, videoUrl: 2000 };
        for (const [field, max] of Object.entries(nullableTextFields)) {
            if (req.body?.[field] !== undefined) {
                const value = req.body[field] === null ? null : String(req.body[field]).trim().slice(0, max) || null;
                if ((field === 'avatarUrl' || field === 'videoUrl') && value && !isAllowedMediaUrl(value)) {
                    return res.status(400).json({ error: 'MEDIA_URL_INVALID' });
                }
                dataToUpdate[field] = value;
            }
        }
        if (req.body?.email !== undefined) {
            const email = req.body.email ? normalizeEmail(req.body.email) : null;
            if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Email invalid.' });
            dataToUpdate.email = email;
        }
        if (req.body?.phone !== undefined) {
            const phone = req.body.phone ? normalizePhone(req.body.phone) : null;
            if (phone && !/^07\d{8}$/.test(phone)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Telefon invalid.' });
            dataToUpdate.phone = phone;
        }
        if (req.body?.hourlyRate !== undefined) dataToUpdate.hourlyRate = Math.max(0, Math.min(100000, Number(req.body.hourlyRate) || 0));
        if (req.body?.trustFactor !== undefined) dataToUpdate.trustFactor = Math.max(0, Math.min(100, Number(req.body.trustFactor) || 0));
        if (Array.isArray(req.body?.actionAreas)) dataToUpdate.actionAreas = req.body.actionAreas.slice(0, 50).map((item: unknown) => String(item).slice(0, 3));
        if (typeof req.body?.archived === 'boolean') {
            if (req.body.archived === false) {
                const billing = await prisma.billingAccount.findUnique({ where: { heroId: req.params.id } });
                const entitled = billing
                    && ['ACTIVE', 'FREE'].includes(billing.status)
                    && billing.currentPeriodEnd
                    && billing.currentPeriodEnd > new Date();
                if (!entitled) {
                    return res.status(409).json({
                        error: 'ENTITLEMENT_REQUIRED',
                        message: 'Profilul poate fi publicat numai cu abonament sau gratuitate activă. Folosește override-ul auditat de gratuitate.',
                    });
                }
            }
            dataToUpdate.archived = req.body.archived;
        }
        // Parolele nu mai sunt setate sau trimise prin Admin; se folosesc invitații/reset securizat.
        const updated = await prisma.hero.update({
            where: { id: req.params.id },
            data: dataToUpdate,
            // `phone` adăugat explicit: a ieșit din `publicHeroSelect` (§7), dar
            // ruta asta e ADMIN-only și adminul tocmai a putut edita numărul —
            // fără el în răspuns, formularul din panou s-ar goli după salvare.
            select: { ...publicHeroSelect, phone: true },
        });
        await prisma.auditLog.create({
            data: { actorType: 'ADMIN', actorId: req.user.id, action: 'HERO_UPDATED', entityType: 'Hero', entityId: req.params.id, metadata: { fields: Object.keys(dataToUpdate) } },
        });
        res.json(updated);
    } catch (e: any) {
        if (e?.code === 'P2002') return res.status(409).json({ error: 'DUPLICATE_VALUE', message: 'Username-ul sau alt câmp unic este deja folosit.' });
        res.status(500).json({ error: 'Update failed' });
    }
});

app.post('/api/admin/heroes/:id/reset-access', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const hero = await prisma.hero.findFirst({ where: { id: req.params.id, deletedAt: null } });
        if (!hero?.email) return res.status(400).json({ error: 'HERO_EMAIL_REQUIRED' });
        await prisma.$transaction(async (tx) => {
            await tx.hero.update({ where: { id: hero.id }, data: { passwordHash: null } });
            const inviteToken = await createOnboardingInvite(tx, hero.id);
            const link = frontendUrl(`/onboarding?token=${encodeURIComponent(inviteToken)}`);
            await queueEmail(tx, `hero-access-reset:${hero.id}:${crypto.createHash('sha256').update(inviteToken).digest('hex')}`, {
                to: hero.email!,
                subject: 'RESETARE ACCES',
                title: 'ACCES SECURIZAT',
                message: 'Accesul vechi a fost invalidat. Setează o parolă nouă folosind linkul unic, valabil 72 de ore.',
                dataFields: { User: hero.username },
                ctaLink: link,
                ctaText: 'SETEAZĂ PAROLA NOUĂ',
            });
        });
        await auth.revokeActorSessions('HERO', hero.id);
        await prisma.auditLog.create({ data: { actorType: 'ADMIN', actorId: req.user.id, action: 'HERO_ACCESS_RESET', entityType: 'Hero', entityId: hero.id } });
        res.json({ success: true, emailQueued: true });
    } catch (error) {
        console.error('hero reset access:', error);
        res.status(500).json({ error: 'RESET_ACCESS_FAILED' });
    }
});

app.post('/api/admin/security/rotate-hero-access', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    if (req.body?.confirm !== 'ROTATE_ALL_HERO_PASSWORDS') {
        return res.status(400).json({ error: 'CONFIRMATION_REQUIRED' });
    }
    try {
        // Procesabil în loturi: repetarea endpointului continuă cu următoarele
        // conturi care încă au hash legacy, fără să retrimită celor deja rotiți.
        const heroes = await prisma.hero.findMany({
            where: { deletedAt: null, passwordHash: { not: null }, email: { not: null } },
            orderBy: { createdAt: 'asc' },
            take: 200,
        });
        let rotated = 0;
        for (const hero of heroes) {
            await prisma.$transaction(async (tx) => {
                await tx.hero.update({ where: { id: hero.id }, data: { passwordHash: null } });
                const inviteToken = await createOnboardingInvite(tx, hero.id);
                const link = frontendUrl(`/onboarding?token=${encodeURIComponent(inviteToken)}`);
                await queueEmail(tx, `hero-security-rotation:${hero.id}:${crypto.createHash('sha256').update(inviteToken).digest('hex')}`, {
                    to: hero.email!,
                    subject: 'RESETARE DE SECURITATE',
                    title: 'ACCES VECHI INVALIDAT',
                    message: 'Din motive de securitate, parola veche a fost invalidată. Folosește linkul unic în următoarele 72 de ore.',
                    dataFields: { User: hero.username },
                    ctaLink: link,
                    ctaText: 'SETEAZĂ PAROLA NOUĂ',
                });
            });
            await auth.revokeActorSessions('HERO', hero.id);
            rotated += 1;
        }
        await prisma.auditLog.create({ data: { actorType: 'ADMIN', actorId: req.user.id, action: 'HERO_ACCESS_BULK_ROTATED', entityType: 'Hero', metadata: { rotated } } });
        const remaining = await prisma.hero.count({ where: { deletedAt: null, passwordHash: { not: null }, email: { not: null } } });
        res.json({ success: true, rotated, remaining, repeatRequired: remaining > 0 });
    } catch (error) {
        console.error('bulk rotate access:', error);
        res.status(500).json({ error: 'ROTATE_ACCESS_FAILED' });
    }
});

app.delete('/api/heroes/:id', adminGate, authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const now = new Date();
        await prisma.$transaction(async (tx) => {
            await tx.$queryRawUnsafe(
                'SELECT pg_advisory_xact_lock(hashtextextended($1, 0::bigint))',
                `entitlement:${req.params.id}`,
            );
            const billing = await tx.billingAccount.findUnique({ where: { heroId: req.params.id }, select: { id: true } });
            if (billing) {
                await tx.$queryRawUnsafe(
                    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0::bigint))',
                    `billing-settle:${billing.id}`,
                );
            }
            await tx.hero.update({
                where: { id: req.params.id },
                data: {
                    // Golim email/telefon ca să NU rămână blocat câmpul unic după ștergere
                    // (altfel nimeni nu se mai poate reînregistra cu acel email/telefon).
                    archived: true, deletedAt: now, passwordHash: null, email: null, phone: null,
                    subscriptionStatus: 'CANCELLED', subscriptionEndsAt: null, nextChargeAt: null,
                    cardToken: null, cardMask: null,
                },
            });
            await tx.billingAccount.updateMany({
                where: { heroId: req.params.id },
                data: { status: 'CANCELLED', cancelAtPeriodEnd: true, cancelledAt: now, nextChargeAt: null },
            });
            await tx.paymentMethod.updateMany({
                where: { billingAccount: { heroId: req.params.id } },
                data: {
                    status: 'REVOKED', revokedAt: now, encryptedToken: 'REVOKED',
                    providerCustomerId: null, mask: null, expiresAt: null,
                },
            });
            await tx.paymentAttempt.updateMany({
                where: { billingAccount: { heroId: req.params.id } },
                data: { checkoutUrlEncrypted: null },
            });
            await tx.paymentAttempt.updateMany({
                where: { billingAccount: { heroId: req.params.id }, status: 'PENDING', providerPaymentId: null },
                data: { status: 'CANCELLED', detail: 'Tentativă oprită la ștergerea contului.', nextRetryAt: null },
            });
            await tx.referralCode.updateMany({ where: { heroId: req.params.id }, data: { active: false } });
            await tx.onboardingInvite.updateMany({ where: { heroId: req.params.id, usedAt: null }, data: { usedAt: now } });
            await tx.pushToken.deleteMany({ where: { heroId: req.params.id } });
            await tx.notification.deleteMany({ where: { heroId: req.params.id } });
        });
        await auth.revokeActorSessions('HERO', req.params.id);
        await prisma.auditLog.create({ data: { actorType: 'ADMIN', actorId: req.user.id, action: 'HERO_ARCHIVED', entityType: 'Hero', entityId: req.params.id } });
        res.json({ success: true });
    } catch {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// === EROU: ștergere cont propriu (GDPR + cerință obligatorie Apple) ===
// Eroul își poate șterge definitiv contul din aplicație. Recenziile și cererile
// asociate se șterg în cascadă (onDelete: Cascade în schema Prisma). Jurnalul de
// plăți (PaymentLog) se păstrează pentru obligația contabilă/fiscală, dar se
// dezasociază de erou (heroId -> null), ca să nu mai conțină legătură personală.
app.delete('/api/hero/me', authenticateToken, async (req: any, res: Response) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    try {
        const hero = await prisma.hero.findUnique({ where: { id: req.user.id } });
        if (!hero) return res.status(404).json({ error: 'Not found' });

        await prisma.$transaction(async (tx) => {
            await tx.$queryRawUnsafe(
                'SELECT pg_advisory_xact_lock(hashtextextended($1, 0::bigint))',
                `entitlement:${hero.id}`,
            );
            const billing = await tx.billingAccount.findUnique({ where: { heroId: hero.id }, select: { id: true } });
            if (billing) {
                await tx.$queryRawUnsafe(
                    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0::bigint))',
                    `billing-settle:${billing.id}`,
                );
            }
            await tx.pushToken.deleteMany({ where: { heroId: hero.id } });
            await tx.paymentMethod.updateMany({
                where: { billingAccount: { heroId: hero.id } },
                data: {
                    status: 'REVOKED', revokedAt: new Date(), encryptedToken: 'REVOKED',
                    providerCustomerId: null, mask: null, expiresAt: null,
                },
            });
            await tx.paymentAttempt.updateMany({
                where: { billingAccount: { heroId: hero.id } },
                data: { checkoutUrlEncrypted: null },
            });
            await tx.paymentAttempt.updateMany({
                where: { billingAccount: { heroId: hero.id }, status: 'PENDING', providerPaymentId: null },
                data: { status: 'CANCELLED', detail: 'Tentativă oprită la ștergerea contului.', nextRetryAt: null },
            });
            await tx.notification.deleteMany({ where: { heroId: hero.id } });
            await tx.referralCode.updateMany({ where: { heroId: hero.id }, data: { active: false } });
            await tx.onboardingInvite.updateMany({ where: { heroId: hero.id, usedAt: null }, data: { usedAt: new Date() } });
            await tx.hero.update({
                where: { id: hero.id },
                data: {
                    alias: 'Cont șters',
                    realName: null,
                    username: `deleted-${hero.id}`,
                    passwordHash: null,
                    description: 'Cont șters la cererea utilizatorului.',
                    powers: '',
                    location: null,
                    avatarUrl: null,
                    videoUrl: null,
                    phone: null,
                    email: null,
                    actionAreas: [],
                    archived: true,
                    deletedAt: new Date(),
                    subscriptionStatus: 'CANCELLED',
                    subscriptionEndsAt: null,
                    nextChargeAt: null,
                    cardToken: null,
                    cardMask: null,
                },
            });
            await tx.billingAccount.updateMany({ where: { heroId: hero.id }, data: { status: 'CANCELLED', cancelAtPeriodEnd: true, cancelledAt: new Date(), nextChargeAt: null } });
            await tx.authSession.updateMany({ where: { actorType: 'HERO', actorId: hero.id }, data: { revokedAt: new Date() } });
        });

        if (hero.email) {
            await sendEmail(
                hero.email,
                'CONT ȘTERS',
                'DOSAR ÎNCHIS DEFINITIV',
                `Salut ${hero.alias}, contul tău Superfix și toate datele asociate (profil, misiuni, recenzii) au fost șterse definitiv, la cererea ta. Ne pare rău că pleci! Poți reveni oricând cu o aplicație nouă.`,
                { Status: 'ȘTERS DEFINITIV' }
            );
        }
        res.json({ success: true });
    } catch (e) {
        console.error('Delete account error:', e);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Cache simplu în memorie cu TTL, pentru endpointuri PUBLICE de citire (contract identic,
// doar servit din memorie sub trafic). NU se folosește pe rute autentificate/personalizate.
const readCache = new Map<string, { body: any; exp: number }>();
const READ_CACHE_MAX = 3000;
const cacheGet = (key: string) => {
    const e = readCache.get(key);
    if (!e) return null;
    if (Date.now() > e.exp) { readCache.delete(key); return null; }
    return e.body;
};
const cacheSet = (key: string, body: any, ttlMs: number) => {
    if (readCache.size >= READ_CACHE_MAX) {
        let i = 0; const drop = Math.ceil(READ_CACHE_MAX * 0.1);
        for (const k of readCache.keys()) { readCache.delete(k); if (++i >= drop) break; }
    }
    readCache.set(key, { body, exp: Date.now() + ttlMs });
};

// === "CINE E SUB COSTUM" — helpere ===
const ORIGIN_FIELDS = ['yearsActive', 'originStory', 'hardestMission', 'neverDoes', 'favoriteTool', 'team', 'petPeeve', 'arsenal', 'proudMissionId'];
// Scoate povestea din răspunsul public dacă e ascunsă de admin; elimină mereu flag-ul intern.
const publicHeroPayload = (hero: any) => {
    if (!hero) return hero;
    const h: any = { ...hero };
    if (h.originHidden) { for (const f of ORIGIN_FIELDS) delete h[f]; }
    delete h.originHidden;
    return h;
};
const stripTags = (v: unknown) => String(v ?? '').replace(/<[^>]*>/g, '').trim();
const createOriginEditToken = async (heroId: string) => {
    const token = randomOpaqueToken();
    await prisma.originEditToken.create({
        data: { heroId, tokenHash: hashOpaqueToken(token), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    return token;
};
const resolveOriginToken = async (rawToken: string): Promise<string | null> => {
    const raw = String(rawToken || '').trim();
    if (!raw) return null;
    const rec = await prisma.originEditToken.findUnique({
        where: { tokenHash: hashOpaqueToken(raw) },
        include: { hero: { select: { deletedAt: true } } },
    });
    if (!rec || rec.expiresAt <= new Date() || rec.hero.deletedAt) return null;
    return rec.heroId;
};
// Erou logat (sesiune) SAU token de origine din email. Returnează heroId sau null.
const resolveOriginActor = async (req: AuthRequest): Promise<string | null> => {
    if (req.user?.role === 'HERO') return req.user.id;
    const raw = req.method === 'GET' ? (req.query as any)?.token : (req.body as any)?.token;
    return resolveOriginToken(String(raw || ''));
};
// O poză de arsenal trebuie să fie Cloudinary permis ȘI din folderul propriu al eroului.
const ownsHeroMedia = (url: string, heroId: string) =>
    isAllowedMediaUrl(url) && (url.includes(`/superfix/hero/${heroId}/`) || url.includes(`/superfix/onboarding/${heroId}/`));

app.get('/api/heroes', async (req, res) => {
    const cached = cacheGet('heroes:all');
    if (cached) return res.json(cached);
    const heroes = await prisma.hero.findMany({
        where: { archived: false, deletedAt: null },
        select: publicHeroSelect,
    });
    cacheSet('heroes:all', heroes, 60_000);
    res.json(heroes);
});

// === LISTĂ EROI PAGINATĂ + FILTRARE PE SERVER (scalare 80k) ===
// Endpoint NOU (nu schimbă `/api/heroes`, ca să nu strice site-ul live).
// IMPORTANT: înregistrat ÎNAINTE de `/api/heroes/:id` ca să nu fie capturat de `:id`.
app.get('/api/heroes/search', async (req: any, res) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '15'), 10) || 15));
        const category = req.query.category ? String(req.query.category) : '';
        const search = req.query.search ? String(req.query.search).trim() : '';
        const countiesRaw = req.query.counties ? String(req.query.counties) : '';
        const counties = countiesRaw.split(',').map((c) => c.trim()).filter(Boolean);

        const cacheKey = `search:${page}:${limit}:${category.toLowerCase()}:${search.toLowerCase()}:${[...counties].sort().join(',')}`;
        const cachedResult = cacheGet(cacheKey);
        if (cachedResult) return res.json(cachedResult);

        const where: any = { archived: false, deletedAt: null };
        if (category && category.toUpperCase() !== 'ALL') {
            where.category = { equals: category, mode: 'insensitive' };
        }
        if (search) {
            where.OR = [
                { alias: { contains: search, mode: 'insensitive' } },
                { realName: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (counties.length) {
            // actionAreas e un array JSON de coduri de județ; match „oricare din counties".
            where.AND = [{ OR: counties.map((c) => ({ actionAreas: { array_contains: [c] } })) }];
        }

        const [total, heroes] = await Promise.all([
            prisma.hero.count({ where }),
            prisma.hero.findMany({
                where,
                select: publicHeroSelect,
                orderBy: { trustFactor: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);

        const result = { heroes, total, page, limit, hasMore: page * limit < total };
        cacheSet(cacheKey, result, 30_000);
        res.json(result);
    } catch (e) {
        console.error('heroes/search error:', e);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.get('/api/heroes/slug/:slug', async (req, res) => {
    const hero = await prisma.hero.findFirst({
        where: { OR: [{ slug: req.params.slug }, { id: req.params.slug }], archived: false, deletedAt: null },
        select: publicHeroProfileSelect,
    });
    if (!hero) return res.status(404).json({ error: 'Erou inexistent sau nelistat' });
    res.json(publicHeroPayload(hero));
});

app.get('/api/heroes/:id', async (req, res) => {
    const hero = await prisma.hero.findFirst({
        where: { id: req.params.id, archived: false, deletedAt: null },
        select: publicHeroProfileSelect,
    });
    if (!hero) return res.status(404).json({ error: 'Erou inexistent sau nelistat' });
    res.json(publicHeroPayload(hero));
});

/**
 * `GET /api/heroes/:id/phone` — numărul, unul câte unul (CONT-FANTOMA.md §7, §8).
 *
 * Numărul a ieșit din `publicHeroSelect`; aici e singurul loc din care mai iese.
 * Cotele din tabelul §8:
 *   - anonim (dispozitiv fără nicio cerere trimisă): **1 erou, o singură dată**;
 *   - cont fantomă sau verificat: **10 eroi / 24h**.
 *
 * Cota se numără din `AuditLog`, nu dintr-un contor separat: documentul face
 * jurnalul sursa adevărului, iar un contor pe rândul `Device` s-ar pierde la
 * reinstalare exact la cine avem motiv să-l reținem.
 *
 * Se numără **eroi distincți**, nu apăsări. Cine reîncarcă pagina primește
 * același număr fără să plătească a doua oară — altfel un refresh ar închide
 * definitiv singurul număr al unui om anonim, ceea ce ar fi o pedeapsă pentru
 * nimic. Ca efect secundar, numărul distinct e și semnalul bun de scraper.
 *
 * Nu folosește `makeDeviceIdentity`: acolo un dispozitiv fără client primește
 * 401, iar aici anonimul are voie la un număr. E singura rută unde „anonim" e
 * un caz de succes, nu unul de respins.
 *
 * Fără sesiune ȘI fără token de dispozitiv nu există pe ce ține socoteala, deci
 * răspunsul e `DEVICE_REQUIRED`: aplicația/situl cheamă `POST /api/device` și
 * reia. Nu e o barieră serioasă pentru un script — dar `POST /api/device` e el
 * însuși limitat la 10/oră/IP, deci un token nou pe secundă nu se poate.
 */
app.get('/api/heroes/:id/phone', phoneRevealLimiter, optionalAuthenticateToken, deviceMiddleware, async (req: AuthRequest & DeviceRequest, res) => {
    try {
        const heroId = String(req.params.id || '');
        const hero = await prisma.hero.findFirst({
            where: { id: heroId, archived: false, deletedAt: null },
            select: { id: true, phone: true },
        });
        if (!hero) return res.status(404).json({ error: 'Erou inexistent sau nelistat' });
        if (!hero.phone) {
            return res.status(404).json({ error: 'PHONE_UNAVAILABLE', message: 'Eroul n-a lăsat un număr. Trimite-i o cerere și te sună el.' });
        }

        // Sesiunea are prioritate (§6). Un HERO/ADMIN/RECRUITER logat nu intră în
        // cotele pentru clienți: nu el e problema din §7.
        const sessionClientId = req.user?.role === 'CLIENT' ? req.user.id : null;
        const staff = !!req.user && req.user.role !== 'CLIENT';
        const clientId = sessionClientId || req.device?.clientId || null;
        const deviceId = req.device?.id || null;

        if (!staff && !clientId && !deviceId) {
            return res.status(401).json({
                error: 'DEVICE_REQUIRED',
                message: 'Redeschide aplicația și încearcă din nou.',
            });
        }

        const actorType: 'CLIENT' | 'ANON' = clientId ? 'CLIENT' : 'ANON';
        const actorId = clientId || deviceId!;
        const limit = clientId ? 10 : 1;
        // Fantoma și contul verificat au cotă zilnică; anonimul are una singură,
        // pe viață — deci fereastra lui nu se închide niciodată.
        const since = clientId ? new Date(Date.now() - 24 * 60 * 60 * 1000) : undefined;

        if (!staff) {
            // `actorType` e pus în AMBELE interogări nu de formă: singurul index
            // util e `AuditLog(actorType, actorId, createdAt)`, iar `actorId`
            // fără coloana din față nu-l poate folosi — ar ieși scanare completă
            // pe tabelul care crește cel mai repede din sistem.
            const actorWhere = { actorType, actorId, action: AUDIT.PHONE_REVEAL, entityType: 'Hero' };
            const already = await prisma.auditLog.findFirst({
                where: { ...actorWhere, entityId: heroId },
                select: { id: true },
            });
            if (!already) {
                // Bariera pe anonimi a fost scoasă (31 aug 2026, la cererea userului
                // — un singur număr pe viață era prea enervant). Contul verificat
                // păstrează cota de 10/zi; anonimul rămâne doar contabilizat în audit
                // (pentru `/api/admin/investigate`), fără blocaj. Plasa reală pentru
                // scraping rămâne limiterul pe IP (`phoneRevealLimiter`, 10/oră).
                if (clientId) {
                    const used = await prisma.auditLog.count({
                        where: { ...actorWhere, ...(since ? { createdAt: { gte: since } } : {}) },
                    });
                    if (used >= limit) {
                        // Copy-ul din §7: întors spre ce câștigă omul, nu spre ce a făcut.
                        return res.status(403).json({
                            error: 'PHONE_QUOTA',
                            message: 'Ai deschis multe numere azi. Mai încearcă mâine sau scrie-i eroului în aplicație.',
                            canClaimAccount: false,
                        });
                    }
                }
                // Se AȘTEAPTĂ: dacă rândul n-ar fi scris înainte de răspuns, două
                // cereri una după alta ar citi amândouă același `used` și cota
                // n-ar mai exista. Cereri cu adevărat simultane tot pot strecura
                // una — plasa pentru ele e limiterul pe IP, nu numărătoarea asta.
                await writeAuditSync(prisma, {
                    actorType,
                    actorId,
                    action: AUDIT.PHONE_REVEAL,
                    entityType: 'Hero',
                    entityId: heroId,
                    metadata: { ip: clientIp(req), deviceId, viaSession: !!sessionClientId },
                });
            }
        }

        return res.json({ phone: hero.phone });
    } catch (error) {
        console.error('hero phone reveal error:', error);
        return res.status(500).json({ error: 'PHONE_ERROR', message: 'Nu am putut deschide numărul. Încearcă din nou.' });
    }
});

// === SERVICE REQUESTS & MISSIONS ===

/**
 * Cine e clientul unei cereri (CONT-FANTOMA.md §6), de la cel mai sigur la cel
 * mai slab:
 *   1. sesiune de CLIENT logat — comportamentul de azi;
 *   2. `Client` existent cu același telefon — asta repară bugul din §3, unde
 *      cererile trimise de pe site rămâneau nelegate de contul omului;
 *   3. `Client` fantomă nouă: fără parolă, fără email (§4).
 *
 * Rostul e ca `clientId` să fie completat MEREU. Fără el,
 * `ensureMissionConversation` întoarce null și conversația nu se creează
 * niciodată pentru cine n-are cont.
 *
 * Riscul, asumat prin §6: legarea se face pe un telefon netastat-verificat, deci
 * cine tastează telefonul altcuiva ajunge în istoricul acelui cont. Plasa e
 * blocarea pe telefon (§9), nu tokenul de dispozitiv.
 *
 * Rulează ÎN AFARA tranzacției dinadins: în Postgres, o eroare de unicitate în
 * interiorul unei tranzacții o abortează pe toată, deci recitirea de după cursă
 * n-ar mai funcționa acolo.
 *
 * Întoarce `null` — adică cererea rămâne anonimă, exact ca azi — în două cazuri:
 * rândul găsit e șters logic (nu bagi cereri pe un cont închis, iar telefonul e
 * unic deci nici fantomă nu se poate crea peste el), sau crearea fantomei a picat
 * din alt motiv. O cerere care merge azi nu are voie să pice din cauza asta.
 */
async function resolveRequestClientId(sessionClientId: string | null, name: string, phone: string): Promise<string | null> {
    if (sessionClientId) return sessionClientId;
    const existing = await prisma.client.findUnique({ where: { phone }, select: { id: true, deletedAt: true } });
    if (existing) return existing.deletedAt ? null : existing.id;
    try {
        const ghost = await prisma.client.create({ data: { name, phone, email: null, passwordHash: null } });
        return ghost.id;
    } catch (error: any) {
        if (error?.code === 'P2002') {
            // Două cereri simultane de pe același telefon: una câștigă cursa pe
            // indexul unic, cealaltă recitește rândul câștigătorului.
            const raced = await prisma.client.findUnique({ where: { phone }, select: { id: true, deletedAt: true } });
            return raced && !raced.deletedAt ? raced.id : null;
        }
        console.error('ghost client create error:', error);
        return null;
    }
}

app.post('/api/request', requestLimiter, optionalAuthenticateToken, deviceMiddleware, async (req: AuthRequest & DeviceRequest, res) => {
    try {
        const heroId = String(req.body?.heroId || '');
        const description = String(req.body?.description || '').trim().slice(0, 5000);
        const address = String(req.body?.address || '').trim().slice(0, 300) || null;
        const latNum = Number(req.body?.lat);
        const lngNum = Number(req.body?.lng);
        const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum) && Math.abs(latNum) <= 90 && Math.abs(lngNum) <= 180;
        const hero = await prisma.hero.findFirst({ where: { id: heroId, archived: false, deletedAt: null } });
        if (!hero) return res.status(404).json({ error: 'HERO_NOT_AVAILABLE', message: 'Eroul nu este disponibil pentru cereri.' });
        if (description.length < 5) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Descrie problema în câteva cuvinte.' });
        // Poze atașate de client (§4.2): doar URL-uri de pe domeniul nostru de media, max 6.
        const requestPhotos = Array.isArray(req.body?.requestPhotos)
            ? req.body.requestPhotos
                .filter((u: unknown) => typeof u === 'string' && isAllowedMediaUrl(u))
                .slice(0, 6)
                .map((u: string) => u.slice(0, 2000))
            : [];
        // Clientul din SESIUNE. Rămâne singura sursă pentru nume/telefon/email și
        // pentru cheia de idempotență. Dacă le-aș lua din clientul rezolvat mai jos,
        // aceleași date ar produce altă cheie după deploy, iar o retrimitere ar
        // deveni cerere dublă. Și emailul de confirmare ar pleca la adresa contului
        // găsit după telefon, nu la cea tastată în formular.
        const sessionClient = req.user?.role === 'CLIENT'
            ? await prisma.client.findFirst({ where: { id: req.user.id, deletedAt: null } })
            : null;
        const clientName = sessionClient?.name || String(req.body?.clientName || '').trim().slice(0, 120);
        const clientPhone = sessionClient?.phone || normalizePhone(req.body?.clientPhone);
        const clientEmail = sessionClient?.email || (req.body?.clientEmail ? normalizeEmail(req.body.clientEmail) : null);
        if (clientName.length < 2 || !/^07\d{8}$/.test(clientPhone)) {
            return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Numele și telefonul sunt obligatorii.' });
        }
        const rawNonce = String(req.header('Idempotency-Key') || req.body?.clientNonce || '').trim();
        if (rawNonce && !/^[A-Za-z0-9._:-]{8,100}$/.test(rawNonce)) {
            return res.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY' });
        }
        // Formula rămâne IDENTICĂ cu cea de azi (derivată din sesiune, nu din
        // clientul rezolvat) — altfel dedublarea s-ar rupe exact peste deploy.
        const idempotencyKey = rawNonce
            ? crypto.createHash('sha256').update(`${sessionClient ? `client:${sessionClient.id}` : `guest:${clientPhone}`}:${heroId}:${rawNonce}`).digest('hex')
            : null;

        // §9: poarta e pe TELEFON, nu doar pe IP. Limiterul pe IP rămâne (nu se
        // scoate nimic), dar singur nu vede numărul care bombardează toți eroii
        // din oraș de pe rețele diferite și blochează degeaba un birou întreg.
        //
        // Se sare peste ea la o RETRIMITERE dedublată: aia nu creează nimic, iar
        // dacă ar consuma cotă, o rețea proastă ar putea închide un om care n-a
        // trimis decât o cerere. Verificarea în plus se face doar când clientul
        // a trimis un nonce, și e o citire pe index unic.
        const replay = idempotencyKey
            ? await prisma.serviceRequest.findUnique({ where: { idempotencyKey }, select: { id: true } })
            : null;
        let warning: PhoneWarning | null = null;
        if (!replay) {
            // Instalarea oprită se verifică ÎNAINTEA numărului: dacă omul de la
            // tastatură a fost oprit fiindcă folosea numerele altora, întrebarea
            // „ce-i cu numărul ăsta" nu mai are rost, iar răspunsul pe număr i-ar
            // spune ce număr să încerce data viitoare.
            const deviceGate = await checkDeviceAllowed(prisma, req.device?.id ?? null);
            if (!deviceGate.ok) return res.status(deviceGate.status).json(deviceGate.body);
            const gate = await checkPhoneAllowed(prisma, clientPhone);
            if (!gate.ok) return res.status(gate.status).json(gate.body);
            warning = gate.warning ?? null;
        }

        const clientId = await resolveRequestClientId(sessionClient?.id ?? null, clientName, clientPhone);
        let createdNew = true;
        let request: any;
        try {
            request = await prisma.$transaction(async (tx: any) => {
                if (idempotencyKey) {
                    const existing = await tx.serviceRequest.findUnique({ where: { idempotencyKey } });
                    if (existing) {
                        createdNew = false;
                        return existing;
                    }
                }
                const created = await tx.serviceRequest.create({
                    data: {
                        heroId, clientId, clientName, clientPhone, clientEmail, description, status: 'PENDING',
                        idempotencyKey,
                        // Urma instalării. Fără ea nu se poate răspunde la
                        // „numărul ăsta a fost folosit de pe un telefon care a
                        // mai folosit alte cinci" — adică exact întrebarea care
                        // decide dacă blocăm numărul sau instalarea.
                        deviceId: req.device?.id ?? null,
                        address,
                        lat: hasCoords ? latNum : null,
                        lng: hasCoords ? lngNum : null,
                        requestPhotos: requestPhotos.length ? requestPhotos : undefined,
                    }
                });
                await ensureMissionConversation(tx, created);
                await createNotification(tx, { heroId }, {
                    type: 'MISSION_NEW', title: 'Misiune nouă', body: `${clientName}: ${description.slice(0, 120)}`, url: `/mission/${created.id}`,
                });
                return created;
            });
        } catch (error: any) {
            if (error?.code !== 'P2002' || !idempotencyKey) throw error;
            request = await prisma.serviceRequest.findUnique({ where: { idempotencyKey } });
            if (!request) throw error;
            createdNew = false;
        }
        // Treapta 4 din §6: dispozitivul se leagă de client. Se face și pe duplicat —
        // dacă prima încercare a rămas fără legătură, a doua o repară. Funcția nu
        // suprascrie un dispozitiv legat deja de altcineva și nu aruncă niciodată.
        if (req.device && clientId) await linkDeviceToClient(prisma, req.device.id, clientId);

        if (!createdNew) {
            return res.status(200).json({ success: true, id: request.id, conversationId: request.clientId ? `mission:${request.id}` : null, duplicate: true });
        }
        // §10: faptul, nu traficul. Doar pe cerere NOUĂ — o retrimitere dedublată
        // nu e un fapt nou și ar strica exact raportul care detectează scraperul
        // (multe PHONE_REVEAL, zero REQUEST_CREATED — §7).
        // `phone` intră în metadata fiindcă e identificatorul cu care vine
        // plângerea („m-a sunat 07xx") și azi nu se poate căuta nicăieri (§10).
        writeAudit(prisma, {
            actorType: clientId ? 'CLIENT' : 'ANON',
            actorId: clientId || req.device?.id || 'anonim',
            action: AUDIT.REQUEST_CREATED,
            entityType: 'ServiceRequest',
            entityId: request.id,
            metadata: {
                heroId, phone: clientPhone, ip: clientIp(req),
                deviceId: req.device?.id ?? null,
                // Fantomă = a ajuns aici fără sesiune. Ăsta e semnalul de adopție.
                ghost: !sessionClient && !!clientId,
            },
        });
        // Email către EROU
        if (hero?.email) {
            const randomMsg = getRandomMsg('HERO_ALERT');
            await sendEmail(
                hero.email,
                'MISIUNE NOUĂ',
                'COD ROSU',
                randomMsg,
                { Cetățean: clientName, Telefon: clientPhone, Problema: description },
                frontendUrl('/portal'),
                'INTRA ÎN PORTAL'
            );
        }
        // Push către EROU (instant, în plus față de email)
        await sendPush(
            { heroId },
            '🚨 Misiune nouă!',
            `${clientName}: ${String(description || '').slice(0, 90)}`,
            { url: '/portal' }
        );
        // Email către CLIENT
        if (clientEmail) {
            const randomMsg = getRandomMsg('CLIENT_WAITING');
            await sendEmail(
                clientEmail,
                'CERERE TRIMISĂ',
                'CONFIRMARE',
                randomMsg,
                { Status: 'Se așteaptă răspuns', 'Erou Contactat': hero?.alias || 'N/A' }
            );
        }
        // `conversationId` rămâne legat de SESIUNE, nu de clientul rezolvat: conversația
        // se creează acum și pentru fantome, dar mesageria cere `authenticateToken`, deci
        // un id dat unui apelant fără sesiune ar produce doar 401-uri în aplicație.
        // Deschiderea chatului pentru fantome nu e în pașii 1-3 din §15.
        // `request.clientId`, nu sesiunea: fantoma poate deschide acum conversația
        // cu `X-Device-Token`, deci are dreptul la id. Sursa e rândul salvat, ca pe
        // drumul de duplicat să răspundă starea reală, nu ce-am rezolvat acum.
        // Idul nu e un secret: `resolveConversation` refuză oricum pe cine nu e
        // clientul conversației. Fără cerere legată de un client (client șters),
        // rămâne `null` — nu există conversație de deschis.
        // §12: tokenul de revendicare. Se emite DOAR pentru cine a trimis fără
        // sesiune — pe un cont logat instalarea aplicației e o conectare normală,
        // deci un token în plus ar fi doar o cheie de furat degeaba.
        //
        // Numai el are voie prin URL. Numele, telefonul și adresa nu trec pe acolo:
        // un URL ajunge în logurile serverului, în `Referer`, în istoric și în
        // clipboard când omul dă „copiază linkul".
        const claimToken = clientId && !sessionClient ? await issueClaimToken(prisma, clientId) : null;
        // Treapta 1 a scării de abuz (§9): avertismentul se livrează ODATĂ cu o
        // cerere REUȘITĂ, nu ca refuz. Se scrie abia acum, după ce răspunsul e
        // sigur că pleacă — momentul ăsta e cel care deschide dreptul de a bloca
        // mai târziu, deci n-are voie să fie notat pentru un avertisment care
        // n-a ajuns pe ecran.
        if (warning) {
            writeAudit(prisma, {
                actorType: clientId ? 'CLIENT' : 'ANON',
                actorId: clientId || req.device?.id || 'anonim',
                action: AUDIT.PHONE_WARNED,
                entityType: 'Phone',
                entityId: clientPhone,
                metadata: { reports: warning.reports, requestId: request.id },
            });
        }
        res.status(201).json({
            success: true,
            id: request.id,
            conversationId: request.clientId ? `mission:${request.id}` : null,
            // Linkul se dă gata compus: dacă l-ar construi fiecare client în parte,
            // o singură scriere greșită a domeniului ar rupe tăcut instalarea.
            ...(claimToken ? { claimToken, claimUrl: frontendUrl(`/app?c=${encodeURIComponent(claimToken)}`) } : {}),
            ...(warning ? { warning } : {}),
        });
    } catch (e) {
        console.error('request error:', e);
        res.status(500).json({ error: 'REQUEST_ERROR', message: 'Cererea nu a putut fi salvată.' });
    }
});

app.get('/api/request', adminGate, authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const requests = await prisma.serviceRequest.findMany({
        orderBy: { date: 'desc' },
        include: { hero: { select: { id: true, alias: true, email: true, phone: true } } },
        take: 1000,
    });
    res.json(requests);
});

// Dashboard Erou - Misiunile mele
app.get('/api/hero/my-missions', authenticateToken, async (req: any, res: Response) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    const heroId = req.user.id;
    const missions = await prisma.serviceRequest.findMany({ where: { heroId }, orderBy: { date: 'desc' }, include: { hero: { select: publicHeroSelect } } });
    res.json(missions);
});

// Update Status Misiune
app.put('/api/missions/:id/status', authenticateToken, async (req: any, res: Response) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    const status = String(req.body?.status || '');
    const photo = req.body?.photo ? String(req.body.photo).slice(0, 2000) : null;
    if (photo && !isAllowedMediaUrl(photo)) return res.status(400).json({ error: 'MEDIA_URL_INVALID' });
    // Consimțământ portofoliu (opțional, doar la COMPLETED). Fără consimțământ → nu se publică.
    const publishToPortfolio = req.body?.publishToPortfolio === true;
    const portfolioConsentAt = req.body?.portfolioConsentAt ? new Date(req.body.portfolioConsentAt) : null;
    const missionId = req.params.id;
    const heroId = req.user.id;
    try {
        const mission = await prisma.serviceRequest.findUnique({ where: { id: missionId }, include: { hero: true } });
        if (!mission) return res.status(404).json({ error: 'MISSION_NOT_FOUND' });
        if (mission.heroId !== heroId) return res.status(403).json({ error: 'Forbidden' });
        // Retry după un răspuns pierdut: prima tranzacție a salvat deja atât
        // statusul, cât și notificarea, deci răspundem idempotent.
        if (mission.status === status) return res.json({ success: true, duplicate: true });
        const transitions: Record<string, string[]> = {
            PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
            ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
            IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
            COMPLETED: [], REJECTED: [], CANCELLED: [],
        };
        if (!transitions[mission.status]?.includes(status)) {
            return res.status(409).json({ error: 'INVALID_STATUS_TRANSITION', message: `Tranziția ${mission.status} → ${status} nu este permisă.` });
        }
        if ((status === 'IN_PROGRESS' || status === 'COMPLETED') && !photo) {
            return res.status(400).json({ error: 'PHOTO_REQUIRED', message: 'Fotografia lucrării este obligatorie.' });
        }
        const updated = await prisma.$transaction(async (tx) => {
            const changed = await tx.serviceRequest.updateMany({
                where: { id: missionId, heroId, status: mission.status },
                data: {
                    status,
                    ...(status === 'IN_PROGRESS' ? { photoBefore: photo } : {}),
                    ...(status === 'COMPLETED' ? { photoAfter: photo } : {}),
                },
            });
            if (changed.count !== 1) throw new Error('STATUS_CONFLICT');
            if (status === 'COMPLETED') {
                await tx.hero.update({
                    where: { id: heroId },
                    data: { trustFactor: { increment: 5 }, missionsCompleted: { increment: 1 } },
                });
                await tx.hero.updateMany({ where: { id: heroId, trustFactor: { gt: 100 } }, data: { trustFactor: 100 } });
            }
            await createNotification(tx, { clientId: mission.clientId || undefined }, {
                type: 'MISSION_STATUS',
                title: status === 'ACCEPTED' ? 'Misiune acceptată' : status === 'COMPLETED' ? 'Misiune finalizată' : 'Status misiune actualizat',
                body: `${mission.hero.alias}: ${status}`,
                url: `/chat/mission:${mission.id}`,
            });
            return changed;
        });
        // Portofoliu: la finalizare cu consimțământ explicit → propunere PENDING_REVIEW
        // Consimțământul explicit al eroului PUBLICĂ direct (APPROVED) → apare imediat pe profil.
        // Adminul poate elimina ulterior (post-moderare, vezi /api/admin/portfolio/:id/remove).
        // NU copiem mission.description (text scris de client, poate conține date personale).
        // Idempotent pe missionId. Best-effort: nu blochează finalizarea.
        if (status === 'COMPLETED' && publishToPortfolio && mission.photoBefore && photo) {
            try {
                await prisma.portfolioItem.upsert({
                    where: { missionId },
                    update: {},
                    create: {
                        heroId,
                        missionId,
                        beforeUrl: mission.photoBefore,
                        afterUrl: photo,
                        title: 'Lucrare finalizată',
                        category: mission.hero.category,
                        completedAt: new Date(),
                        reviewStatus: 'APPROVED',
                        consentAt: portfolioConsentAt || new Date(),
                        requestedByHeroId: heroId,
                    },
                });
            } catch (e) {
                console.error('portfolio upsert error:', e);
            }
        }
        // Push către CLIENT (instant, în plus față de email)
        if (mission.clientId) {
            const pushTitle = status === 'ACCEPTED' ? 'Eroul vine!' : status === 'COMPLETED' ? 'Misiune finalizată' : 'Status misiune actualizat';
            await sendPush(
                { clientId: mission.clientId },
                pushTitle,
                `${mission.hero.alias}: ${status}`,
                { url: `/chat/mission:${mission.id}` },
            );
        }
        if (mission.clientEmail) {
            if (status === 'ACCEPTED') {
                const randomMsg = getRandomMsg('MISSION_ACCEPTED');
                await sendEmail(
                    mission.clientEmail,
                    'EROUL VINE!',
                    'MISIUNE ACCEPTATĂ',
                    randomMsg,
                    { 'Agent Asignat': mission.hero.alias, Status: 'ÎN DEPLASARE' }
                );
            } else if (status === 'REJECTED') {
                const randomMsg = getRandomMsg('MISSION_REJECTED');
                await sendEmail(
                    mission.clientEmail,
                    'UPDATE MISIUNE',
                    'EROUL INDISPONIBIL',
                    randomMsg,
                    {},
                    frontendUrl('/heroes'),
                    'GĂSEȘTE ALT EROU'
                );
            } else if (status === 'COMPLETED') {
                const randomMsg = getRandomMsg('MISSION_COMPLETED');
                await sendEmail(
                    mission.clientEmail,
                    'MISIUNE ÎNDEPLINITĂ',
                    'DOSAR ÎNCHIS',
                    randomMsg,
                    { Rezultat: 'SUCCES', Erou: mission.hero.alias },
                    frontendUrl(`/hero/${mission.hero.id}`),
                    'LASĂ O RECENZIE'
                );
            }
        }
        res.json({ success: true, updated: updated.count });
    } catch (error: any) {
        if (error?.message === 'STATUS_CONFLICT') return res.status(409).json({ error: 'STATUS_CONFLICT', message: 'Misiunea a fost actualizată între timp.' });
        console.error('mission status error:', error);
        res.status(500).json({ error: 'UPDATE_ERROR' });
    }
});

// Anulare misiune de către CLIENT — doar propria misiune, doar înainte de start (PENDING/ACCEPTED).
app.post('/api/missions/:id/cancel', authenticateToken, async (req: any, res: Response) => {
    if (req.user.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' });
    const missionId = req.params.id;
    try {
        const mission = await prisma.serviceRequest.findUnique({ where: { id: missionId }, include: { hero: true } });
        if (!mission) return res.status(404).json({ error: 'MISSION_NOT_FOUND' });
        if (mission.clientId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        if (mission.status === 'CANCELLED') return res.json({ success: true, duplicate: true });
        if (!['PENDING', 'ACCEPTED'].includes(mission.status)) {
            return res.status(409).json({ error: 'CANNOT_CANCEL', message: 'Misiunea nu mai poate fi anulată în acest stadiu.' });
        }
        await prisma.$transaction(async (tx) => {
            const changed = await tx.serviceRequest.updateMany({
                where: { id: missionId, clientId: req.user.id, status: mission.status },
                data: { status: 'CANCELLED' },
            });
            if (changed.count !== 1) throw new Error('STATUS_CONFLICT');
            await createNotification(tx, { heroId: mission.heroId }, {
                type: 'MISSION_STATUS',
                title: 'Misiune anulată',
                body: `Clientul a anulat: ${mission.description.slice(0, 90)}`,
                url: `/chat/mission:${mission.id}`,
            });
        });
        await sendPush({ heroId: mission.heroId }, 'Misiune anulată', 'Clientul a anulat misiunea.', { url: `/chat/mission:${mission.id}` });
        res.json({ success: true });
    } catch (error: any) {
        if (error?.message === 'STATUS_CONFLICT') return res.status(409).json({ error: 'STATUS_CONFLICT', message: 'Misiunea a fost actualizată între timp.' });
        console.error('mission cancel error:', error);
        res.status(500).json({ error: 'CANCEL_ERROR' });
    }
});

// === "CINE E SUB COSTUM" — povestea eroului (sesiune SAU token din email) ===
app.get('/api/hero/origin', optionalAuthenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const heroId = await resolveOriginActor(req);
        if (!heroId) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Autentificare necesară.' });
        const hero = await prisma.hero.findFirst({
            where: { id: heroId, deletedAt: null },
            select: {
                alias: true, slug: true, yearsActive: true, originStory: true, hardestMission: true,
                neverDoes: true, favoriteTool: true, team: true, petPeeve: true, arsenal: true, proudMissionId: true,
            },
        });
        if (!hero) return res.status(404).json({ error: 'HERO_NOT_FOUND' });
        // Lucrări finalizate cu poză, din care eroul alege „misiunea de care e mândru".
        const missions = await prisma.serviceRequest.findMany({
            where: { heroId, status: 'COMPLETED', photoAfter: { not: null } },
            orderBy: { updatedAt: 'desc' },
            take: 50,
            select: { id: true, description: true, photoBefore: true, photoAfter: true },
        });
        res.json({
            ...hero,
            missions: missions.map((m: any) => ({
                id: m.id,
                title: (m.description || '').slice(0, 80),
                beforeUrl: m.photoBefore,
                afterUrl: m.photoAfter,
            })),
        });
    } catch (error) {
        console.error('hero/origin GET error:', error);
        res.status(500).json({ error: 'ORIGIN_READ_ERROR' });
    }
});

app.post('/api/hero/origin', optionalAuthenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const heroId = await resolveOriginActor(req);
        if (!heroId) return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Autentificare necesară.' });
        const b: any = req.body || {};
        const data: any = {};
        const setText = (key: string, max: number) => {
            if (b[key] === undefined) return;
            data[key] = b[key] === null ? null : (stripTags(b[key]).slice(0, max) || null);
        };
        setText('originStory', 800);
        setText('hardestMission', 800);
        setText('neverDoes', 800);
        setText('petPeeve', 800);
        setText('favoriteTool', 80);
        setText('team', 80);

        if (b.yearsActive !== undefined) {
            if (b.yearsActive === null || b.yearsActive === '') data.yearsActive = null;
            else {
                const n = Number(b.yearsActive);
                if (!Number.isInteger(n) || n < 0 || n > 70) return res.status(400).json({ error: 'YEARS_INVALID', message: 'Ani de experiență: întreg între 0 și 70.' });
                data.yearsActive = n;
            }
        }
        if (b.arsenal !== undefined) {
            if (b.arsenal === null) data.arsenal = null;
            else {
                if (!Array.isArray(b.arsenal)) return res.status(400).json({ error: 'ARSENAL_INVALID' });
                const urls = b.arsenal.map((u: any) => String(u)).slice(0, 8);
                for (const u of urls) {
                    if (!ownsHeroMedia(u, heroId)) return res.status(400).json({ error: 'ARSENAL_URL_INVALID', message: 'Pozele trebuie urcate prin upload-ul propriu.' });
                }
                data.arsenal = urls;
            }
        }
        if (b.proudMissionId !== undefined) {
            if (!b.proudMissionId) data.proudMissionId = null;
            else {
                const m = await prisma.serviceRequest.findFirst({
                    where: { id: String(b.proudMissionId), heroId, status: 'COMPLETED' },
                    select: { id: true },
                });
                if (!m) return res.status(400).json({ error: 'PROUD_MISSION_INVALID', message: 'Misiunea trebuie să fie a ta și finalizată.' });
                data.proudMissionId = m.id;
            }
        }
        if (Object.keys(data).length === 0) return res.status(400).json({ error: 'NOTHING_TO_UPDATE' });
        await prisma.hero.update({ where: { id: heroId }, data });
        res.json({ success: true });
    } catch (error) {
        console.error('hero/origin POST error:', error);
        res.status(500).json({ error: 'ORIGIN_WRITE_ERROR' });
    }
});

// Admin: listă povești + comutator de ascundere (fără coadă de aprobare, publicare imediată).
app.get('/api/admin/origins', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const heroes = await prisma.hero.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { originStory: { not: null } }, { hardestMission: { not: null } },
                    { neverDoes: { not: null } }, { favoriteTool: { not: null } },
                    { team: { not: null } }, { petPeeve: { not: null } }, { yearsActive: { not: null } },
                ],
            },
            orderBy: { updatedAt: 'desc' },
            take: 200,
            select: {
                id: true, alias: true, slug: true, originHidden: true, yearsActive: true,
                originStory: true, hardestMission: true, neverDoes: true, favoriteTool: true,
                team: true, petPeeve: true, arsenal: true,
            },
        });
        res.json(heroes);
    } catch (error) { console.error('admin origins error:', error); res.status(500).json({ error: 'ORIGINS_LIST_ERROR' }); }
});

app.post('/api/admin/hero/:id/origin-visibility', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const hidden = req.body?.hidden === true;
    try {
        const r = await prisma.hero.updateMany({ where: { id: req.params.id, deletedAt: null }, data: { originHidden: hidden } });
        if (!r.count) return res.status(404).json({ error: 'NOT_FOUND' });
        res.json({ success: true, originHidden: hidden });
    } catch (error) { console.error('origin-visibility error:', error); res.status(500).json({ error: 'ORIGIN_VISIBILITY_ERROR' }); }
});

// Admin: trimite eroului linkul „Cine e sub costum" pe email (David decide când).
app.post('/api/admin/hero/:id/send-origin-invite', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const hero = await prisma.hero.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true, email: true, alias: true } });
        if (!hero) return res.status(404).json({ error: 'HERO_NOT_FOUND' });
        if (!hero.email) return res.status(400).json({ error: 'HERO_NO_EMAIL' });
        const token = await createOriginEditToken(hero.id);
        const link = frontendUrl(`/cine-e-sub-costum?token=${encodeURIComponent(token)}`);
        await sendEmail(
            hero.email,
            'CINE EȘTI SUB COSTUM?',
            'POVESTEA TA',
            `Salut ${hero.alias}! Spune-le clienților cine ești cu adevărat — de câți ani faci meseria, cea mai grea misiune, unealta preferată. Durează 3 minute și te scoate în evidență.`,
            {},
            link,
            'SCRIE-ȚI POVESTEA',
        );
        res.json({ success: true });
    } catch (error) { console.error('send-origin-invite error:', error); res.status(500).json({ error: 'ORIGIN_INVITE_ERROR' }); }
});

// === JURNAL DE API PENTRU ADMIN (developer mode) ===
// Paginare pe CURSOR (nu OFFSET): la milioane de rânduri, OFFSET scanează degeaba.
const apiLogStatusFilter = (status?: string) => {
    if (status === '4xx') return { gte: 400, lt: 500 };
    if (status === '5xx') return { gte: 500 };
    if (status === 'err') return { gte: 400 };
    return undefined; // 'all' sau nespecificat
};
const apiLogWhere = (q: any) => {
    const where: any = {};
    if (typeof q.actorId === 'string' && q.actorId) where.actorId = q.actorId.slice(0, 64);
    if (typeof q.actorType === 'string' && q.actorType) where.actorType = q.actorType.slice(0, 20);
    // §10: `ip` era stocat dar nu se putea interoga, deci întrebarea „cine altcineva
    // a mai fost pe IP-ul ăsta" n-avea răspuns. E prima întrebare a unei investigații.
    if (typeof q.ip === 'string' && q.ip) where.ip = q.ip.slice(0, 45);
    const st = apiLogStatusFilter(typeof q.status === 'string' ? q.status : undefined);
    if (st) where.status = st;
    const since = typeof q.since === 'string' ? new Date(q.since) : null;
    const until = typeof q.until === 'string' ? new Date(q.until) : null;
    if (since && !Number.isNaN(since.getTime())) where.createdAt = { ...(where.createdAt || {}), gte: since };
    if (until && !Number.isNaN(until.getTime())) where.createdAt = { ...(where.createdAt || {}), lte: until };
    return where;
};

app.get('/api/admin/logs', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const where = apiLogWhere(req.query);
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
        const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;
        const rows = await prisma.apiLog.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1, // +1 ca să știm dacă mai există pagină
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
    } catch (error) { console.error('admin logs error:', error); res.status(500).json({ error: 'LOGS_LIST_ERROR' }); }
});

app.get('/api/admin/logs/summary', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const where = apiLogWhere(req.query);
        const [total, byStatusRaw, slowest, topErrors] = await Promise.all([
            prisma.apiLog.count({ where }),
            prisma.apiLog.groupBy({ by: ['status'], where, _count: { _all: true } }),
            prisma.apiLog.findMany({
                where, orderBy: { durationMs: 'desc' }, take: 10,
                select: { method: true, path: true, status: true, durationMs: true, actorType: true, createdAt: true },
            }),
            prisma.apiLog.groupBy({
                by: ['errorCode', 'path'],
                where: { ...where, status: { gte: 400 } },
                _count: { _all: true },
                orderBy: { _count: { path: 'desc' } },
                take: 10,
            }),
        ]);
        // Grupăm statusurile pe clase (2xx/3xx/4xx/5xx) pentru ecranul de pornire.
        const byStatus: Record<string, number> = {};
        for (const row of byStatusRaw as any[]) {
            const bucket = `${Math.floor(row.status / 100)}xx`;
            byStatus[bucket] = (byStatus[bucket] || 0) + row._count._all;
        }
        res.json({
            total,
            byStatus,
            slowest,
            topErrors: (topErrors as any[]).map((e) => ({ errorCode: e.errorCode, path: e.path, count: e._count._all })),
        });
    } catch (error) { console.error('admin logs summary error:', error); res.status(500).json({ error: 'LOGS_SUMMARY_ERROR' }); }
});

// === AUDIT: faptele, nu traficul (CONT-FANTOMA.md §10) ===
// `ApiLog` spune „cineva a citit un profil". `AuditLog` spune CARE profil, fiindcă
// are `entityId`. Filtrat pe aceleași chei ca logurile, plus `action` și entitate.
app.get('/api/admin/audit', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const q = req.query;
        const where: any = {};
        if (typeof q.actorId === 'string' && q.actorId) where.actorId = q.actorId.slice(0, 64);
        if (typeof q.actorType === 'string' && q.actorType) where.actorType = q.actorType.slice(0, 20);
        if (typeof q.action === 'string' && q.action) where.action = q.action.slice(0, 40);
        if (typeof q.entityType === 'string' && q.entityType) where.entityType = q.entityType.slice(0, 40);
        if (typeof q.entityId === 'string' && q.entityId) where.entityId = q.entityId.slice(0, 64);
        const since = typeof q.since === 'string' ? new Date(q.since) : null;
        const until = typeof q.until === 'string' ? new Date(q.until) : null;
        if (since && !Number.isNaN(since.getTime())) where.createdAt = { ...(where.createdAt || {}), gte: since };
        if (until && !Number.isNaN(until.getTime())) where.createdAt = { ...(where.createdAt || {}), lte: until };

        const limit = Math.min(200, Math.max(1, Number(q.limit) || 100));
        const cursor = typeof q.cursor === 'string' && q.cursor ? q.cursor : null;
        const rows = await prisma.auditLog.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
    } catch (error) { console.error('admin audit error:', error); res.status(500).json({ error: 'AUDIT_LIST_ERROR' }); }
});

// === ECRANUL DE OM (§10) ===
// „Dai un telefon / un cont / un token / un IP și primești firul complet."
// Motivul pentru care e o rută și nu patru filtre: la o plângere nu știi ce cauți.
// Vine cu „m-a sunat 07xx" și de acolo trebuie să ajungi la dispozitive, cereri,
// mesaje și IP-uri fără să știi dinainte pe ce cheie se leagă.
//
// Regula §9 rămâne în picioare: **niciun identificator nu e dovadă singur.**
// Ecranul le pune pe toate pe aceeași linie de timp tocmai ca omul să decidă.
app.get('/api/admin/investigate', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const rawPhone = typeof req.query.phone === 'string' ? req.query.phone : '';
        const phone = rawPhone ? normalizePhone(rawPhone) : '';
        const clientId = typeof req.query.clientId === 'string' ? req.query.clientId.slice(0, 64) : '';
        const deviceToken = typeof req.query.deviceToken === 'string' ? req.query.deviceToken.slice(0, 200) : '';
        const ip = typeof req.query.ip === 'string' ? req.query.ip.slice(0, 45) : '';
        // Eroul e a doua parte a firului (§10 zice "cont", dar plângerile vin des
        // pe "eroul X mi-a cerut numărul de două ori") — cheie separată, nu se
        // amestecă în `clientIds`, fiindcă un erou nu e niciodată un client.
        const heroId = typeof req.query.heroId === 'string' ? req.query.heroId.slice(0, 64) : '';
        const action = typeof req.query.action === 'string' ? req.query.action.slice(0, 64) : '';
        const parseDate = (v: unknown): Date | null => {
            if (typeof v !== 'string' || !v) return null;
            const d = new Date(v);
            return isNaN(d.getTime()) ? null : d;
        };
        const fromDate = parseDate(req.query.from);
        const toDate = parseDate(req.query.to);
        if (!phone && !clientId && !deviceToken && !ip && !heroId) {
            return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Dă un telefon, un cont, un erou, un token de dispozitiv sau un IP.' });
        }

        // Pasul 1: de la orice cheie, ajungem la un set de clienți.
        const clientIds = new Set<string>();
        if (clientId) clientIds.add(clientId);
        if (phone) {
            const byPhone = await prisma.client.findUnique({ where: { phone }, select: { id: true } });
            if (byPhone) clientIds.add(byPhone.id);
        }
        if (deviceToken) {
            const dev = await prisma.device.findUnique({ where: { token: deviceToken }, select: { clientId: true } });
            if (dev?.clientId) clientIds.add(dev.clientId);
        }
        if (ip) {
            // Cine a mai fost pe IP-ul ăsta. Corelare, nu dovadă: CGNAT înseamnă
            // că mii de oameni pot împărți un IP (§9).
            const actors = await prisma.apiLog.findMany({
                where: { ip, actorType: 'CLIENT', actorId: { not: null } },
                select: { actorId: true }, distinct: ['actorId'], take: 50,
            });
            for (const a of actors as any[]) if (a.actorId) clientIds.add(a.actorId);
        }

        const ids = [...clientIds];
        const clients = ids.length
            ? await prisma.client.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true, phone: true, email: true, passwordHash: true, createdAt: true, deletedAt: true },
            })
            : [];

        // Pasul 2: firul. Cererile se caută ȘI după telefon, nu doar după clientId —
        // cererile vechi de pe site n-au clientId deloc (bugul din §3) și tocmai
        // alea lipsesc dintr-o investigație care se uită numai la conturi.
        const requestWhere: any = { OR: [] as any[] };
        if (ids.length) requestWhere.OR.push({ clientId: { in: ids } });
        if (phone) requestWhere.OR.push({ clientPhone: phone });
        if (heroId) requestWhere.OR.push({ heroId });
        const requests = requestWhere.OR.length
            ? await prisma.serviceRequest.findMany({
                where: requestWhere,
                // `ServiceRequest` datează pe `date`, nu pe `createdAt`.
                orderBy: { date: 'desc' }, take: 100,
                select: {
                    id: true, heroId: true, clientId: true, clientName: true, clientPhone: true,
                    status: true, date: true, description: true,
                },
            })
            : [];

        const devices = ids.length
            ? await prisma.device.findMany({
                where: { clientId: { in: ids } },
                orderBy: { lastSeenAt: 'desc' }, take: 100,
                select: { id: true, platform: true, clientId: true, createdAt: true, lastSeenAt: true },
            })
            : [];

        // Faptele: după actor (clienți sau dispozitive) — DEVICE_CREATED e scris pe
        // id-ul dispozitivului, înainte să existe vreun client de legat. Eroul
        // intră separat: e propriul lui actor, nu se pierde în `ids`.
        const auditActors = [...ids, ...devices.map((d: any) => d.id)];
        if (heroId) auditActors.push(heroId);
        const auditWhere: any = { actorId: { in: auditActors } };
        if (action) auditWhere.action = action;
        if (fromDate || toDate) {
            auditWhere.createdAt = {};
            if (fromDate) auditWhere.createdAt.gte = fromDate;
            if (toDate) auditWhere.createdAt.lte = toDate;
        }
        const audit = auditActors.length
            ? await prisma.auditLog.findMany({
                where: auditWhere,
                orderBy: { createdAt: 'desc' }, take: 200,
            })
            : [];

        const messages = ids.length
            ? await prisma.message.count({ where: { senderRole: 'CLIENT', senderId: { in: ids } } })
            : 0;

        // IP-urile de pe care a intrat, cu ultima dată văzut. Din `ApiLog`, unde
        // sunt deja stocate — fără colectare nouă.
        const ipWhere: any = { ip: { not: null }, OR: [] as any[] };
        if (ids.length) ipWhere.OR.push({ actorType: 'CLIENT', actorId: { in: ids } });
        if (heroId) ipWhere.OR.push({ actorType: 'HERO', actorId: heroId });
        if (fromDate || toDate) {
            ipWhere.createdAt = {};
            if (fromDate) ipWhere.createdAt.gte = fromDate;
            if (toDate) ipWhere.createdAt.lte = toDate;
        }
        const ipRows = ipWhere.OR.length
            ? await prisma.apiLog.findMany({
                where: ipWhere,
                orderBy: { createdAt: 'desc' }, take: 300,
                select: { ip: true, userAgent: true, createdAt: true },
            })
            : [];
        const ipSeen = new Map<string, { ip: string; userAgent: string | null; lastAt: Date; count: number }>();
        for (const row of ipRows as any[]) {
            const found = ipSeen.get(row.ip);
            if (found) { found.count += 1; continue; }
            ipSeen.set(row.ip, { ip: row.ip, userAgent: row.userAgent, lastAt: row.createdAt, count: 1 });
        }

        res.json({
            query: {
                phone: phone || null, clientId: clientId || null, deviceToken: deviceToken ? 'dat' : null,
                ip: ip || null, heroId: heroId || null, action: action || null,
                from: fromDate ? fromDate.toISOString() : null, to: toDate ? toDate.toISOString() : null,
            },
            clients: clients.map((c: any) => ({
                id: c.id, name: c.name, phone: c.phone, email: c.email,
                // Starea contului E `passwordHash` (§5, fără câmp separat de stare).
                // Hash-ul nu iese din server nici către admin.
                verified: c.passwordHash !== null,
                createdAt: c.createdAt, deletedAt: c.deletedAt,
            })),
            devices,
            requests,
            messagesSent: messages,
            audit,
            ips: [...ipSeen.values()],
        });
    } catch (error) { console.error('admin investigate error:', error); res.status(500).json({ error: 'INVESTIGATE_ERROR' }); }
});

// === FUNNEL DE RECRUTARE (vizibilitate pe etape + bază pentru follow-up) ===
// Etichetează oamenii pe etapa exactă în care sunt. Eroii aprobați-dar-neactivați
// (archived=true) sunt invizibili în listele normale — AICI îi vezi. Segmentele de aici
// sunt exact cele pentru viitorul sistem de emailuri de follow-up.
// Definiția stărilor pentru eroi (aplicațiile PENDING sunt tratate separat):
const FUNNEL_HERO_WHERE: Record<string, any> = {
    APROBAT_FARA_ONBOARDING: { deletedAt: null, archived: true, passwordHash: null },
    ONBOARDED_FARA_CARD:     { deletedAt: null, archived: true, passwordHash: { not: null } },
    ACTIV_FARA_POVESTE:      { deletedAt: null, archived: false, originStory: null },
    ACTIV_COMPLET:           { deletedAt: null, archived: false, originStory: { not: null } },
};
const FUNNEL_HERO_SELECT = {
    id: true, alias: true, email: true, phone: true, category: true,
    subscriptionStatus: true, originStory: true, createdAt: true, updatedAt: true,
} as const;

app.get('/api/admin/funnel', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const stage = typeof req.query.stage === 'string' ? req.query.stage : '';
        // Fără stage → doar numărătorile (dashboard-ul). Ieftin și scalabil la 80k.
        if (!stage) {
            const [aplicat, aprobat, onboardedNoCard, activNoPoveste, activComplet] = await Promise.all([
                prisma.heroApplication.count({ where: { status: 'PENDING' } }),
                prisma.hero.count({ where: FUNNEL_HERO_WHERE.APROBAT_FARA_ONBOARDING }),
                prisma.hero.count({ where: FUNNEL_HERO_WHERE.ONBOARDED_FARA_CARD }),
                prisma.hero.count({ where: FUNNEL_HERO_WHERE.ACTIV_FARA_POVESTE }),
                prisma.hero.count({ where: FUNNEL_HERO_WHERE.ACTIV_COMPLET }),
            ]);
            return res.json({ counts: {
                APLICAT: aplicat,
                APROBAT_FARA_ONBOARDING: aprobat,
                ONBOARDED_FARA_CARD: onboardedNoCard,
                ACTIV_FARA_POVESTE: activNoPoveste,
                ACTIV_COMPLET: activComplet,
            } });
        }
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
        const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;

        if (stage === 'APLICAT') {
            const rows = await prisma.heroApplication.findMany({
                where: { status: 'PENDING' },
                orderBy: [{ date: 'desc' }, { id: 'desc' }],
                take: limit + 1,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                select: { id: true, name: true, email: true, phone: true, category: true, referralCode: true, recruiterCode: true, date: true },
            });
            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            return res.json({ stage, items, nextCursor: hasMore ? items[items.length - 1].id : null });
        }

        const where = FUNNEL_HERO_WHERE[stage];
        if (!where) return res.status(400).json({ error: 'STAGE_INVALID', message: 'Etapă necunoscută.' });
        const rows = await prisma.hero.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: limit + 1,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: FUNNEL_HERO_SELECT,
        });
        const hasMore = rows.length > limit;
        const items = (hasMore ? rows.slice(0, limit) : rows).map((h: any) => ({
            ...h, hasOrigin: !!h.originStory, originStory: undefined,
        }));
        return res.json({ stage, items, nextCursor: hasMore ? rows[limit - 1].id : null });
    } catch (error) { console.error('admin funnel error:', error); res.status(500).json({ error: 'FUNNEL_ERROR' }); }
});

// Admin: retrimite linkul de onboarding unui erou blocat (aprobat/neactivat).
app.post('/api/admin/hero/:id/resend-onboarding', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const hero = await prisma.hero.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { id: true, email: true, alias: true, username: true } });
        if (!hero) return res.status(404).json({ error: 'HERO_NOT_FOUND' });
        if (!hero.email) return res.status(400).json({ error: 'HERO_NO_EMAIL', message: 'Eroul nu are email pe cont.' });
        const inviteToken = await prisma.$transaction((tx) => createOnboardingInvite(tx, hero.id));
        const onboardingLink = frontendUrl(`/onboarding?token=${encodeURIComponent(inviteToken)}`);
        await sendEmail(
            hero.email,
            'CONTINUĂ-ȚI CONTUL',
            'DOSAR ÎN AȘTEPTARE',
            `Salut ${hero.alias}, mai ai un pas ca să-ți activezi contul de erou. Linkul de mai jos e valabil 72 de ore.`,
            { User: hero.username, Portal: frontendUrl('/portal') },
            onboardingLink,
            'CONTINUĂ ACUM',
        );
        await prisma.auditLog.create({ data: { actorType: 'ADMIN', actorId: req.user.id, action: 'ONBOARDING_RESENT', entityType: 'Hero', entityId: hero.id } });
        res.json({ success: true });
    } catch (error) { console.error('resend-onboarding error:', error); res.status(500).json({ error: 'RESEND_ERROR' }); }
});

// === "DATELE MELE" (profil de bază) — DIRECT, fără aprobare (decizie David 2026-08-21) ===
// Doar sesiune de erou (fără token de email). Doar cele 6 câmpuri publice sigure;
// username/phone/email NU se ating de aici.
app.get('/api/hero/basics', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    try {
        const hero = await prisma.hero.findFirst({
            where: { id: req.user.id, deletedAt: null },
            select: { alias: true, description: true, hourlyRate: true, actionAreas: true, avatarUrl: true, videoUrl: true },
        });
        if (!hero) return res.status(404).json({ error: 'HERO_NOT_FOUND' });
        res.json({ current: hero, pending: null }); // fără coadă de aprobare → pending mereu null
    } catch (e) { console.error('hero/basics GET:', e); res.status(500).json({ error: 'BASICS_READ_ERROR' }); }
});

app.post('/api/hero/basics', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    const b: any = req.body || {};
    const data: any = {};
    try {
        if (b.alias !== undefined) {
            const s = stripTags(b.alias);
            if (s.length < 2 || s.length > 40) return res.status(400).json({ error: 'ALIAS_INVALID', message: 'Numele de erou: 2–40 caractere.' });
            data.alias = s;
        }
        if (b.description !== undefined) {
            const s = stripTags(b.description);
            if (s.length < 10 || s.length > 600) return res.status(400).json({ error: 'DESCRIPTION_INVALID', message: 'Descrierea: 10–600 caractere.' });
            data.description = s;
        }
        if (b.hourlyRate !== undefined) {
            const n = Number(b.hourlyRate);
            if (!Number.isInteger(n) || n < 20) return res.status(400).json({ error: 'RATE_INVALID', message: 'Tariful: întreg, minim 20 RON.' });
            data.hourlyRate = n;
        }
        if (b.actionAreas !== undefined) {
            if (!Array.isArray(b.actionAreas)) return res.status(400).json({ error: 'AREAS_INVALID' });
            const areas = b.actionAreas.map((a: any) => String(a).trim()).filter(Boolean).slice(0, 50);
            if (areas.length < 1) return res.status(400).json({ error: 'AREAS_INVALID', message: 'Alege cel puțin un județ.' });
            data.actionAreas = areas;
        }
        if (b.avatarUrl !== undefined) {
            if (b.avatarUrl && !ownsHeroMedia(String(b.avatarUrl), req.user.id)) return res.status(400).json({ error: 'AVATAR_INVALID', message: 'Poza trebuie urcată prin upload-ul propriu.' });
            data.avatarUrl = b.avatarUrl || null;
        }
        if (b.videoUrl !== undefined) {
            if (b.videoUrl && !ownsHeroMedia(String(b.videoUrl), req.user.id)) return res.status(400).json({ error: 'VIDEO_INVALID', message: 'Clipul trebuie urcat prin upload-ul propriu.' });
            data.videoUrl = b.videoUrl || null;
        }
        if (Object.keys(data).length === 0) return res.status(400).json({ error: 'NOTHING_TO_UPDATE' });
        await prisma.hero.update({ where: { id: req.user.id }, data });
        readCache.delete('heroes:all'); // ca modificarea să apară imediat în listă
        res.json({ success: true });
    } catch (e) { console.error('hero/basics POST:', e); res.status(500).json({ error: 'BASICS_WRITE_ERROR' }); }
});

// === PORTOFOLIU (before/after cu moderare) ===

// Eroul își vede propriile lucrări (toate stările).
app.get('/api/hero/portfolio', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    try {
        const items = await prisma.portfolioItem.findMany({
            where: { heroId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
        res.json(items);
    } catch (e) {
        console.error('hero portfolio list error:', e);
        res.status(500).json({ error: 'PORTFOLIO_LIST_ERROR' });
    }
});

// Eroul publică RETROACTIV o misiune deja finalizată (fără PortfolioItem, sau retrasă
// de el anterior). Simetric cu /retract. Misiunile vechi nu au PortfolioItem, iar
// re-apelarea rutei de status se oprește la verificarea idempotentă — de aceea ruta asta.
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
        if (mission.status !== 'COMPLETED') return res.status(409).json({ error: 'MISSION_NOT_COMPLETED', message: 'Misiunea nu e finalizată.' });
        // beforeUrl/afterUrl sunt obligatorii în schemă (fără `?`) → fără ambele poze nu se poate.
        if (!mission.photoBefore || !mission.photoAfter) {
            return res.status(409).json({ error: 'PHOTOS_MISSING', message: 'Lipsește poza de dinainte sau de după — misiunea asta nu poate fi publicată.' });
        }
        // Respectăm moderarea adminului: o lucrare RESPINSĂ sau ELIMINATĂ DE ADMIN nu poate fi
        // republicată de erou. Retragerea proprie a eroului (reviewReason 'Retras de erou.') se poate.
        const existing = await prisma.portfolioItem.findUnique({ where: { missionId } });
        const adminBlocked = existing && (
            existing.reviewStatus === 'REJECTED' ||
            (existing.reviewStatus === 'REMOVED' && !!existing.reviewedByAdminId && existing.reviewReason !== 'Retras de erou.')
        );
        if (adminBlocked) {
            return res.status(409).json({ error: 'PORTFOLIO_BLOCKED_BY_ADMIN', message: 'Lucrarea a fost oprită de administrator și nu poate fi republicată.' });
        }
        const item = await prisma.portfolioItem.upsert({
            where: { missionId },
            update: { reviewStatus: 'APPROVED', reviewedAt: null, reviewedByAdminId: null, reviewReason: null, consentAt: new Date() },
            create: {
                heroId: req.user.id,
                missionId,
                beforeUrl: mission.photoBefore,
                afterUrl: mission.photoAfter,
                title: 'Lucrare finalizată',
                category: mission.hero.category,
                completedAt: mission.updatedAt, // ServiceRequest n-are câmp dedicat de finalizare
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

// Eroul retrage o lucrare (propusă sau publicată) → REMOVED.
app.post('/api/hero/portfolio/:id/retract', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'HERO') return res.status(403).json({ error: 'Forbidden' });
    try {
        const result = await prisma.portfolioItem.updateMany({
            where: { id: req.params.id, heroId: req.user.id, reviewStatus: { not: 'REMOVED' } },
            data: { reviewStatus: 'REMOVED', reviewedAt: new Date(), reviewReason: 'Retras de erou.' },
        });
        if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' });
        res.json({ success: true });
    } catch (e) {
        console.error('hero portfolio retract error:', e);
        res.status(500).json({ error: 'PORTFOLIO_RETRACT_ERROR' });
    }
});

// Admin: listă (implicit cele în așteptare).
app.get('/api/admin/portfolio', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const status = String(req.query?.status || 'PENDING_REVIEW').toUpperCase();
    try {
        const items = await prisma.portfolioItem.findMany({
            where: status === 'ALL' ? {} : { reviewStatus: status },
            orderBy: { createdAt: 'desc' },
            take: 500,
            include: { hero: { select: { id: true, alias: true, avatarUrl: true, category: true } } },
        });
        res.json(items);
    } catch (e) {
        console.error('admin portfolio list error:', e);
        res.status(500).json({ error: 'PORTFOLIO_LIST_ERROR' });
    }
});

// Admin: aprobă / respinge / elimină.
app.post('/api/admin/portfolio/:id/approve', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const result = await prisma.portfolioItem.updateMany({
            where: { id: req.params.id, reviewStatus: 'PENDING_REVIEW' },
            data: { reviewStatus: 'APPROVED', reviewedAt: new Date(), reviewedByAdminId: req.user.id, reviewReason: null },
        });
        if (!result.count) return res.status(409).json({ error: 'INVALID_TRANSITION', message: 'Doar itemii în așteptare pot fi aprobați.' });
        res.json({ success: true });
    } catch (e) {
        console.error('admin portfolio approve error:', e);
        res.status(500).json({ error: 'PORTFOLIO_APPROVE_ERROR' });
    }
});

app.post('/api/admin/portfolio/:id/reject', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (reason.length < 3) return res.status(400).json({ error: 'REASON_REQUIRED' });
    try {
        const result = await prisma.portfolioItem.updateMany({
            where: { id: req.params.id, reviewStatus: 'PENDING_REVIEW' },
            data: { reviewStatus: 'REJECTED', reviewedAt: new Date(), reviewedByAdminId: req.user.id, reviewReason: reason },
        });
        if (!result.count) return res.status(409).json({ error: 'INVALID_TRANSITION' });
        res.json({ success: true });
    } catch (e) {
        console.error('admin portfolio reject error:', e);
        res.status(500).json({ error: 'PORTFOLIO_REJECT_ERROR' });
    }
});

// Elimină o lucrare deja aprobată (sau orice altă stare) — pentru date personale/obiecții.
app.post('/api/admin/portfolio/:id/remove', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (reason.length < 3) return res.status(400).json({ error: 'REASON_REQUIRED' });
    try {
        const result = await prisma.portfolioItem.updateMany({
            where: { id: req.params.id, reviewStatus: { not: 'REMOVED' } },
            data: { reviewStatus: 'REMOVED', reviewedAt: new Date(), reviewedByAdminId: req.user.id, reviewReason: reason },
        });
        if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' });
        res.json({ success: true });
    } catch (e) {
        console.error('admin portfolio remove error:', e);
        res.status(500).json({ error: 'PORTFOLIO_REMOVE_ERROR' });
    }
});

// === MODERARE REVIEWS (admin) ===
// Recenziile se pot ascunde din public (nu se șterg — rămân pt audit anti-fraudă).
app.get('/api/admin/reviews', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const heroId = req.query?.heroId ? String(req.query.heroId) : undefined;
    const hiddenFilter = req.query?.hidden === 'true' ? true : req.query?.hidden === 'false' ? false : undefined;
    try {
        const reviews = await prisma.review.findMany({
            where: {
                ...(heroId ? { heroId } : {}),
                ...(hiddenFilter !== undefined ? { hidden: hiddenFilter } : {}),
            },
            orderBy: { date: 'desc' },
            take: 500,
            include: {
                hero: { select: { id: true, alias: true } },
                serviceRequest: { select: { id: true, clientId: true, clientPhone: true, status: true } },
            },
        });
        res.json(reviews);
    } catch (e) {
        console.error('admin reviews list error:', e);
        res.status(500).json({ error: 'REVIEWS_LIST_ERROR' });
    }
});

app.post('/api/admin/reviews/:id/hide', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    const reason = String(req.body?.reason || '').trim().slice(0, 500);
    if (reason.length < 3) return res.status(400).json({ error: 'REASON_REQUIRED' });
    try {
        const result = await prisma.review.updateMany({
            where: { id: req.params.id, hidden: false },
            data: { hidden: true, hiddenReason: reason, hiddenAt: new Date(), hiddenByAdminId: req.user.id },
        });
        if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' });
        res.json({ success: true });
    } catch (e) {
        console.error('admin review hide error:', e);
        res.status(500).json({ error: 'REVIEW_HIDE_ERROR' });
    }
});

app.post('/api/admin/reviews/:id/unhide', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
    try {
        const result = await prisma.review.updateMany({
            where: { id: req.params.id, hidden: true },
            data: { hidden: false, hiddenReason: null, hiddenAt: null, hiddenByAdminId: null },
        });
        if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' });
        res.json({ success: true });
    } catch (e) {
        console.error('admin review unhide error:', e);
        res.status(500).json({ error: 'REVIEW_UNHIDE_ERROR' });
    }
});

app.post('/api/reviews', reviewLimiter, authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== 'CLIENT') return res.status(403).json({ error: 'CLIENT_ACCOUNT_REQUIRED' });
    const heroId = String(req.body?.heroId || '');
    const serviceRequestId = req.body?.serviceRequestId ? String(req.body.serviceRequestId) : null;
    const rating = Number(req.body?.rating);
    const comment = String(req.body?.comment || '').trim().slice(0, 2000);
    try {
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 2) {
            return res.status(400).json({ error: 'VALIDATION_ERROR' });
        }
        const client = await prisma.client.findUnique({ where: { id: req.user.id } });
        const mission = serviceRequestId
            ? await prisma.serviceRequest.findUnique({ where: { id: serviceRequestId } })
            : await prisma.serviceRequest.findFirst({
                where: { clientId: req.user.id, heroId, status: 'COMPLETED', review: null },
                orderBy: { date: 'desc' },
            });
        if (!client || !mission || mission.clientId !== client.id || mission.heroId !== heroId || mission.status !== 'COMPLETED') {
            return res.status(403).json({ error: 'REVIEW_NOT_ALLOWED', message: 'Poți evalua doar o lucrare proprie finalizată.' });
        }
        await prisma.$transaction(async (tx) => {
            await tx.review.create({ data: { heroId, clientId: client.id, serviceRequestId: mission.id, clientName: client.name, rating, comment, date: new Date() } });
            if (rating === 5) {
                await tx.hero.update({ where: { id: heroId }, data: { trustFactor: { increment: 2 } } });
                await tx.hero.updateMany({ where: { id: heroId, trustFactor: { gt: 100 } }, data: { trustFactor: 100 } });
            }
        });
        res.status(201).json({ success: true });
    } catch (error: any) {
        if (error?.code === 'P2002') return res.status(409).json({ error: 'REVIEW_EXISTS', message: 'Ai evaluat deja această lucrare.' });
        res.status(500).json({ error: 'REVIEW_ERROR' });
    }
});

// ==================================================
// 🚀 ZONA SEO DINAMIC & SERVIRE FRONTEND
// ==================================================

// Definim unde se află fișierele site-ului construit (folderul 'dist')
// Ajustează calea '../dist' dacă folderul de build are alt nume
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.basename(moduleDir) === 'dist' ? path.resolve(moduleDir, '..', '..') : path.resolve(moduleDir, '..');
const BUILD_PATH = process.env.FRONTEND_DIST_PATH || path.join(projectRoot, 'dist');

// 1. RUTA SPECIALĂ PENTRU EROI (Injectează Poza pentru WhatsApp)
app.get('/hero/:id', async (req, res) => {
    const heroId = req.params.id;
    const indexPath = path.join(BUILD_PATH, 'index.html');

    // Dacă nu există build-ul, dăm eroare (se întâmplă doar în dezvoltare)
    if (!fs.existsSync(indexPath)) {
        return res.status(404).send('Eroare: Nu găsesc frontend-ul (folderul dist). Rulează "npm run build".');
    }

    try {
        // Doar profiluri publice; ruta acceptă atât slug, cât și ID legacy.
        const hero = await prisma.hero.findFirst({
            where: { OR: [{ id: heroId }, { slug: heroId }], archived: false, deletedAt: null },
        });
        
        // Citim fișierul index.html original
        let html = fs.readFileSync(indexPath, 'utf8');

        if (hero) {
            const safeAlias = escapeHtml(hero.alias);
            const safeCategory = escapeHtml(hero.category);
            const safeDescription = escapeHtml(hero.description.substring(0, 100));
            const safeImage = hero.avatarUrl && /^https:\/\//i.test(hero.avatarUrl)
                ? escapeHtml(hero.avatarUrl)
                : 'https://superfix.ro/og-default.jpg';
            html = html
                .replace('__META_TITLE__', `${safeAlias} - ${safeCategory}`)
                .replace('__META_DESCRIPTION__', `Cheamă-l pe ${safeAlias}! Tarif: ${hero.hourlyRate} RON/h. ${safeDescription}...`)
                .replace('__META_IMAGE__', safeImage)
                .replace('<title>SUPERFIX - Cheamă Eroul</title>', `<title>${safeAlias} - Superfix</title>`);
        } else {
            // Dacă eroul nu există, punem date standard
            html = html
                .replace('__META_TITLE__', 'SUPERFIX - Eroare')
                .replace('__META_DESCRIPTION__', 'Eroul căutat nu a fost găsit.')
                .replace('__META_IMAGE__', 'https://superfix.ro/og-default.jpg');
        }

        // Trimitem pagina modificată către WhatsApp/Browser
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(html);

    } catch (error) {
        console.error('Eroare SEO:', error);
        res.status(500).send('Eroare Server');
    }
});

// 2. SERVIREA FIȘIERELOR STATICE (JS, CSS, Imagini)
app.use(express.static(BUILD_PATH));

// 3. RUTA CATCH-ALL (Orice altă pagină returnează index.html standard)
app.get('/{*splat}', (req, res) => {
    const indexPath = path.join(BUILD_PATH, 'index.html');
    if (fs.existsSync(indexPath)) {
        let html = fs.readFileSync(indexPath, 'utf8');
        // Curățăm placeholderele pentru paginile normale
        html = html
            .replace('__META_TITLE__', 'SUPERFIX - Cheamă Eroul')
            .replace('__META_DESCRIPTION__', 'Marketplace pentru meseriași - Stil Supereroi')
            .replace('__META_IMAGE__', 'https://superfix.ro/og-default.jpg');
        res.send(html);
    } else {
        res.status(404).send('Frontend not built');
    }
});

// === HANDLER GLOBAL DE ERORI ===
// Loghează 5xx cu request-id (+ Sentry dacă e configurat) și răspunde generic, fără scurgeri.
app.use((err: any, req: any, res: any, _next: any) => {
    const status = Number(err?.status || err?.statusCode) || 500;
    const rid = req?.id || '-';
    if (typeof err?.message === 'string' && err.message.startsWith('CORS blocked')) {
        if (!res.headersSent) res.status(403).json({ error: 'CORS_BLOCKED', requestId: rid });
        return;
    }
    if (status >= 500) {
        console.error(`[5xx] rid=${rid} ${req?.method} ${req?.originalUrl} ::`, err?.stack || err?.message || err);
        if (process.env.SENTRY_DSN) { try { Sentry.captureException(err); } catch { /* noop */ } }
    }
    if (res.headersSent) return;
    res.status(status >= 400 && status < 600 ? status : 500).json({
        error: status >= 500 ? 'SERVER_ERROR' : (err?.code || 'ERROR'),
        requestId: rid,
    });
});

// === CURĂȚENIA JURNALULUI DE API (independentă de jobul GDPR de retenție) ===
// Șterge rândurile mai vechi de N zile. Rulează O SINGURĂ dată pe cluster (lease
// distribuit prin JobLease + doar pe instanța „leader"), independent de
// ENABLE_RETENTION_CRON — jurnalul se curăță chiar dacă retenția GDPR e oprită.
const API_LOG_RETENTION_DAYS = Math.max(1, Number(process.env.API_LOG_RETENTION_DAYS || 30));
async function runApiLogRetention(client: PrismaClient) {
    const name = 'api-log-retention';
    const owner = crypto.randomUUID();
    const now = new Date();
    await client.jobLease.upsert({ where: { name }, update: {}, create: { name, lockedUntil: new Date(0) } });
    const claimed = await client.jobLease.updateMany({
        where: { name, lockedUntil: { lte: now } },
        data: { owner, lockedUntil: new Date(now.getTime() + 60 * 60_000) },
    });
    if (claimed.count !== 1) return { skipped: 'already-running' as const };
    try {
        const before = new Date(now.getTime() - API_LOG_RETENTION_DAYS * 86400_000);
        const deleted = await client.apiLog.deleteMany({ where: { createdAt: { lte: before } } });
        return { deleted: deleted.count };
    } finally {
        await client.jobLease.updateMany({ where: { name, owner }, data: { owner: null, lockedUntil: new Date(0) } });
    }
}
// === RETENȚIA JURNALULUI DE FAPTE (§13: „termen de păstrare declarat") ===
// Separat de `ApiLog` fiindcă răspunde altei întrebări. `ApiLog` e trafic și se
// uită repede; `AuditLog` susține o investigație — cine a deblocat un număr, cine
// a scos al doilea factor — și aia se cere uneori luni mai târziu.
//
// **Un an e o alegere de business, nu una tehnică.** E scris aici ca să fie
// declarat undeva, cum cere §13, și se schimbă dintr-o variabilă de mediu fără
// atins codul. Dacă juristul spune alt termen, `AUDIT_LOG_RETENTION_DAYS` e
// singurul loc de modificat.
const AUDIT_LOG_RETENTION_DAYS = Math.max(30, Number(process.env.AUDIT_LOG_RETENTION_DAYS || 365));
// Exportată ca să poată fi rulată la cerere (verificare, sau o curățare manuală
// după ce cineva schimbă termenul) — cron-ul de mai jos e doar apelantul obișnuit.
export async function runAuditLogRetention(client: PrismaClient) {
    const name = 'audit-log-retention';
    const owner = crypto.randomUUID();
    const now = new Date();
    await client.jobLease.upsert({ where: { name }, update: {}, create: { name, lockedUntil: new Date(0) } });
    const claimed = await client.jobLease.updateMany({
        where: { name, lockedUntil: { lte: now } },
        data: { owner, lockedUntil: new Date(now.getTime() + 60 * 60_000) },
    });
    if (claimed.count !== 1) return { skipped: 'already-running' as const };
    try {
        const before = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 86400_000);
        // Ștergere în tranșe: un `deleteMany` peste un an de jurnal ține un lock
        // lung pe tabel, iar scrierile de audit ale cererilor în curs ar aștepta
        // după curățenie. Curățenia are voie să dureze; cererile n-au.
        let deleted = 0;
        for (let pass = 0; pass < 50; pass++) {
            const batch: Array<{ id: string }> = await client.auditLog.findMany({
                where: { createdAt: { lte: before } },
                select: { id: true },
                take: 5000,
            });
            if (!batch.length) break;
            const removed = await client.auditLog.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } });
            deleted += removed.count;
            if (batch.length < 5000) break;
        }
        return { deleted };
    } finally {
        await client.jobLease.updateMany({ where: { name, owner }, data: { owner: null, lockedUntil: new Date(0) } });
    }
}
{
    const isCronLeader = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';
    if (isCronLeader && !API_LOG_DISABLED) {
        cron.schedule('23 3 * * *', () => runApiLogRetention(prisma).catch((error) => console.error('API log retention:', error)));
    }
    // La altă oră decât jurnalul de API: două ștergeri mari în paralel pe aceeași
    // bază, la 3 noaptea, nu se ajută cu nimic.
    if (isCronLeader) {
        cron.schedule('47 4 * * *', () => runAuditLogRetention(prisma).catch((error) => console.error('Audit log retention:', error)));
    }
}

// ==================================================
// === START SERVER ===
const httpServer = app.listen(PORT, () => {
    console.log(`🚀 Server Backend "SuperFix" rulează pe portul ${PORT}`);
});

const shutdown = (signal: string) => {
    console.log(`${signal}: închidere controlată...`);
    httpServer.close(() => {
        prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
