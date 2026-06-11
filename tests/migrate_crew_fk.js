const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Migrating serviceRequest.assignedTo names to assignedCrewId FK...');
  const crews = await prisma.crew.findMany();
  const crewMap = {};
  crews.forEach(c => {
    crewMap[c.name.toLowerCase()] = c.id;
  });

  const serviceRequests = await prisma.serviceRequest.findMany({
    where: {
      assignedTo: { not: null }
    }
  });

  let count = 0;
  for (const sr of serviceRequests) {
    const crewNameKey = sr.assignedTo.toLowerCase();
    const crewId = crewMap[crewNameKey];
    if (crewId) {
      await prisma.serviceRequest.update({
        where: { id: sr.id },
        data: { assignedCrewId: crewId }
      });
      count++;
    }
  }

  console.log(`Successfully migrated ${count} service request assignments!`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
