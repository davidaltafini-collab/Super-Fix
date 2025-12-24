import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();
async function main() {
    // Folosește parola din .env sau un fallback
    const password = process.env.ADMIN_PASSWORD || "Admin123!";
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(`🔐 Setare parolă pentru: ${process.env.ADMIN_USERNAME || 'admin'}...`);
    await prisma.admin.upsert({
        where: { username: process.env.ADMIN_USERNAME || 'admin' },
        update: {
            passwordHash: hashedPassword, // <--- ASTA ACTUALIZEAZA PAROLA DACA EXISTA
        },
        create: {
            username: process.env.ADMIN_USERNAME || 'admin',
            passwordHash: hashedPassword,
        },
    });
    console.log('✅ Admin (re)configurat cu succes!');
}
main()
    .catch((e) => console.error(e))
    .finally(async () => {
    await prisma.$disconnect();
});
