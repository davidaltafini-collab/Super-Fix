import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
// Încărcăm explicit .env
dotenv.config();
const prisma = new PrismaClient();
async function diagnose() {
    console.log('\n🕵️  START DIAGNOSTIC SUPERFIX...');
    // 1. Verificăm variabilele de mediu
    const envUser = process.env.ADMIN_USERNAME || 'admin'; // Fallback la 'admin' doar daca lipseste env
    const envPass = process.env.ADMIN_PASSWORD;
    console.log(`1️⃣  VERIFICARE .ENV:`);
    if (!envPass) {
        console.error('   ❌ EROARE CRITICĂ: ADMIN_PASSWORD lipsește din fișierul .env!');
        return;
    }
    console.log(`   ✅ User țintă din .env: "${envUser}"`);
    console.log(`   ✅ Parolă citită din .env: "${envPass}" (Lungime: ${envPass.length})`);
    // 2. Verificăm Baza de Date
    console.log(`\n2️⃣  VERIFICARE DATABASE:`);
    const dbUser = await prisma.admin.findUnique({ where: { username: envUser } });
    if (!dbUser) {
        console.error(`   ❌ Userul "${envUser}" NU a fost găsit în baza de date.`);
        console.log(`   👉 SOLUȚIE: Trebuie să rulezi 'npx ts-node --esm seed.ts' pentru a-l crea.`);
        return;
    }
    console.log(`   ✅ User găsit în DB: ${dbUser.username}`);
    console.log(`   🔐 Hash stocat: ${dbUser.passwordHash.substring(0, 15)}...`);
    // 3. Testăm potrivirea
    console.log(`\n3️⃣  TESTARE COMPARARE (Bcrypt):`);
    const isMatch = await bcrypt.compare(envPass, dbUser.passwordHash);
    if (isMatch) {
        console.log(`   ✅ SUCCES: Parola din .env se potrivește perfect cu hash-ul din DB.`);
        console.log(`   🚀 Concluzie: Login-ul AR TREBUI să meargă. Dacă nu merge din browser, problema e acolo (cache/autofill).`);
    }
    else {
        console.log(`   ❌ EȘEC: Parola din .env NU generează hash-ul din DB.`);
        console.log(`   🔍 Explicatie: Probabil ai schimbat parola în .env DAR nu ai rulat seed-ul din nou.`);
        console.log(`   👉 SOLUȚIE: Rulează 'npx ts-node --esm seed.ts' chiar acum.`);
    }
    console.log('\n🏁 DIAGNOSTIC COMPLET.\n');
}
diagnose()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
