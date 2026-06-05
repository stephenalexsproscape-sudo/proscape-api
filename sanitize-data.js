const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function main() {
  console.log('🧹 Starting Data Sanitization...');
  
  const customers = await prisma.customer.findMany({
    include: { contacts: true, addresses: true }
  });

  let sanitizedCount = 0;
  const issues = [];

  for (const cust of customers) {
    try {
      // 1. Sanitize Customer DisplayName
      const cleanDisplayName = toTitleCase(cust.displayName);
      if (cleanDisplayName !== cust.displayName) {
        await prisma.customer.update({
          where: { id: cust.id },
          data: { displayName: cleanDisplayName }
        });
        sanitizedCount++;
      }

      // 2. Sanitize Contacts
      for (const contact of cust.contacts) {
        const cleanFirst = toTitleCase(contact.firstName);
        const cleanLast = toTitleCase(contact.lastName);
        
        if (cleanFirst !== contact.firstName || cleanLast !== contact.lastName) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { firstName: cleanFirst, lastName: cleanLast }
          });
          sanitizedCount++;
        }

        // Flag missing vital info
        if (!contact.email && !contact.phone) {
          issues.push(`[CRITICAL] Customer "${cust.displayName}" (Contact #${contact.id}) has NO email OR phone.`);
        } else if (!contact.email) {
          issues.push(`[INFO] Customer "${cust.displayName}" is missing email.`);
        } else if (!contact.phone) {
          issues.push(`[INFO] Customer "${cust.displayName}" is missing phone.`);
        }
      }

      // 3. Sanitize Addresses
      for (const addr of cust.addresses) {
        const cleanStreet = toTitleCase(addr.street1);
        const cleanCity = toTitleCase(addr.city);
        const cleanState = addr.state ? addr.state.toUpperCase() : 'PA';

        if (cleanStreet !== addr.street1 || cleanCity !== addr.city || cleanState !== addr.state) {
          await prisma.address.update({
            where: { id: addr.id },
            data: { street1: cleanStreet, city: cleanCity, state: cleanState }
          });
          sanitizedCount++;
        }
      }
    } catch (err) {
      console.error(`⚠️ Failed to sanitize Customer #${cust.id}: ${err.message}`);
    }
  }

  // Write report
  if (issues.length > 0) {
    fs.writeFileSync('sanitization-report.txt', issues.join('\n'));
    console.log(`📝 Sanitization report generated: sanitization-report.txt (${issues.length} issues identified)`);
  }

  console.log(`✅ SUCCESS: ${sanitizedCount} fields normalized across ${customers.length} customers.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
