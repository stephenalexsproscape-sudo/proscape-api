const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createCrewMember() {
  // ==========================================
  // 👷 CREW CREDENTIALS
  // Change these two lines for each new employee
  // ==========================================
  const newUsername = 'ap';
  const plainTextPassword = '5525';

  try {
    const hash = await bcrypt.hash(plainTextPassword, 10);

    // Upsert safely creates the user, or updates the password if they already exist
    await prisma.user.upsert({
      where: { username: newUsername },
      update: { passwordHash: hash, role: 'USER' },
      create: {
        username: newUsername,
        passwordHash: hash,
        role: 'USER', // Standard access, not an Admin
      },
    });

    console.log(`✅ Success: Crew account created for '${newUsername}'!`);
  } catch (error) {
    console.error('❌ Error creating crew member:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createCrewMember();
