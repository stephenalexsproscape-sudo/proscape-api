const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetPassword() {
  // ==========================================
  // 🔐 OVERRIDE CREDENTIALS
  // ==========================================
  const targetUsername = 'admin'; // Change this if your username isn't 'admin'
  const newPassword = 'Juv5@lsd';

  try {
    console.log(`Hashing new password for '${targetUsername}'...`);
    const hash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { username: targetUsername },
      data: { passwordHash: hash },
    });

    console.log(`✅ Success: Password for '${targetUsername}' has been overwritten!`);
  } catch (error) {
    if (error.code === 'P2025') {
      console.error(`❌ Error: The username '${targetUsername}' does not exist in the database.`);
    } else {
      console.error('❌ Error resetting password:', error);
    }
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
