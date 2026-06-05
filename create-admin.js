const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    // 1. Change your password right here
    const plainTextPassword = '55255525';

    // 2. Hash it securely
    const hash = await bcrypt.hash(plainTextPassword, 10);

    // 3. Upsert (Create if missing, Update if it exists)
    await prisma.user.upsert({
      where: { username: 'admin' },
      update: { passwordHash: hash },
      create: {
        username: 'admin',
        passwordHash: hash,
        role: 'ADMIN',
      },
    });

    console.log('✅ Vault Key Created! You can now log in.');
  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
