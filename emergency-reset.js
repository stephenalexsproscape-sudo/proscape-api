const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function resetPassword() {
  // ==========================================
  // 🔐 OVERRIDE CREDENTIALS - EMERGENCY USE ONLY
  // ==========================================
  // SECURITY: Do not commit passwords. Provide via RESET_PASSWORD env var.
  const targetUsername = process.env.RESET_USERNAME || 'admin';
  const newPassword = process.env.RESET_PASSWORD;
  if (!newPassword || newPassword.length < 8) {
    console.error('Usage: RESET_PASSWORD=your-new-secure-pass node emergency-reset.js [RESET_USERNAME=admin]');
    process.exit(1);
  }

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
