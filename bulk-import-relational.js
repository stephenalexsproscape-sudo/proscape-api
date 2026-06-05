const fs = require('fs');
const csv = require('csv-parser');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * CONFIGURATION
 * Point this to your QuickBooks Export or the standard ClientsList.csv
 */
const FILE_PATH = './ClientsList.csv';

const readCSV = (path) => {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(path)) {
      return reject(new Error(`Missing file: ${path}`));
    }
    fs.createReadStream(path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

async function main() {
  console.log('🚀 Starting Smart Relational Import...');
  console.log(`📂 Reading source: ${FILE_PATH}`);

  let rows;
  try {
    rows = await readCSV(FILE_PATH);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    return;
  }

  console.log(`📊 Total rows to process: ${rows.length}`);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      // 1. Extract and Clean Data
      // Mapping based on common QB export headers found in ClientsList.csv
      const rawCustomer = row['Customer'] || row['DisplayName'] || row['Full Name'];
      const rawCompany = row['Company'] || row['Company Name'];
      const firstName = row['First Name'] || '';
      const lastName = row['Last Name'] || '';
      const email = row['Email - Primary'] || row['Email'] || null;
      const phone = row['Phone'] || row['Main Phone'] || null;
      const street = row['Street'] || row['Address'] ? (row['Street'] || row['Address']).replace(/^re:\s*/i, '').trim() : null;
      const city = row['City'] || 'State College';
      const state = row['State'] || 'PA';
      const zip = row['Zip'] || row['Postal Code'] || null;

      if (!rawCustomer) {
        skipped++;
        continue;
      }

      // 2. Handle Company (Relational)
      let companyId = null;
      if (rawCompany && rawCompany.trim() !== '') {
        const company = await prisma.company.upsert({
          where: { name: rawCompany.trim() },
          update: {},
          create: { name: rawCompany.trim() },
        });
        companyId = company.id;
      }

      // 3. Handle Customer (Main Account)
      // We use the displayName as the logical unique key for deduplication
      const existingCustomer = await prisma.customer.findFirst({
        where: { displayName: rawCustomer.trim() },
        include: { contacts: true, addresses: true }
      });

      let customer;
      if (existingCustomer) {
        // Update existing customer (e.g. update company link)
        customer = await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: { companyId },
        });
        updated++;
      } else {
        // Create new customer
        customer = await prisma.customer.create({
          data: {
            displayName: rawCustomer.trim(),
            companyId,
            accountStatus: 'ACTIVE'
          },
        });
        created++;
      }

      // 4. Handle Primary Contact (Relational)
      if (firstName || lastName || email || phone) {
        const contactExists = existingCustomer?.contacts.some(c => 
          (c.email === email && email !== null) || 
          (c.firstName === firstName && c.lastName === lastName)
        );

        if (!contactExists) {
          await prisma.contact.create({
            data: {
              customerId: customer.id,
              firstName,
              lastName,
              email,
              phone: phone ? phone.toString() : null,
              isPrimary: true
            }
          });
        }
      }

      // 5. Handle Service Address (Relational)
      if (street) {
        const addressExists = existingCustomer?.addresses.some(a => 
          a.street1 === street && a.type === 'SERVICE'
        );

        if (!addressExists) {
          await prisma.address.create({
            data: {
              customerId: customer.id,
              street1: street,
              city,
              state: state.substring(0, 2), // Ensure 2-char limit
              zip,
              type: 'SERVICE'
            }
          });
        }
      }

    } catch (err) {
      console.error(`⚠️ Error processing row "${row['Customer']}": ${err.message}`);
      skipped++;
    }
  }

  console.log('\n✨ IMPORT SUMMARY');
  console.log('-----------------');
  console.log(`✅ Created: ${created}`);
  console.log(`🔄 Updated: ${updated}`);
  console.log(`⏩ Skipped: ${skipped}`);
  console.log('-----------------');
  console.log('🚀 SUCCESS: Proscape Database has been synced with source data.');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
