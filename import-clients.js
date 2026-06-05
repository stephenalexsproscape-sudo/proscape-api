const fs = require('fs');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// UPDATE: Pointing to your renamed file
const FILE_PATH = './ClientsList.csv';

async function main() {
  console.log('🚀 Starting Bulk Import from ' + FILE_PATH);
  const clients = [];

  // Check if file exists before starting
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`❌ Error: The file '${FILE_PATH}' was not found in this directory.`);
    process.exit(1);
  }

  // 1. Read and Parse CSV
  fs.createReadStream(FILE_PATH)
    .pipe(csv())
    .on('data', (row) => clients.push(row))
    .on('end', async () => {
      console.log(`📂 Parsed ${clients.length} rows. Writing to Database...`);

      for (const row of clients) {
        try {
          // Logic for cleaning names (handles corporate names vs individual names)
          const fName = row['First Name'] || row['Customer'] || 'Unknown';
          const lName = row['Last Name'] || '';

          // Clean "re:" prefixes from addresses
          const street = row['Street'] ? row['Street'].replace(/^re:\s*/i, '').trim() : null;

          // Create Client + Associated Property in one transaction
          await prisma.client.create({
            data: {
              firstName: fName,
              lastName: lName,
              email: row['Email - Primary'] || null,
              phone: row['Phone'] || null,
              status: 'Active',
              // If they have a street address in the CSV, pre-load it into the sites table
              properties: street
                ? {
                    create: {
                      address: street,
                      city: row['City'] || 'State College',
                      snowSpecs: 'Standard',
                      mulchSpecs: 'Standard',
                    },
                  }
                : undefined,
            },
          });
        } catch (err) {
          console.error(`❌ Skip: ${row['Customer']} - ${err.message}`);
        }
      }

      console.log('✅ Import Complete! Refresh your browser at :5174 to see the roster.');
      await prisma.$disconnect();
    });
}

main();
