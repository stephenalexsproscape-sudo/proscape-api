const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function logAudit(entityType, entityId, action, details, oldValues = null, newValues = null) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType,
        entityId: parseInt(entityId),
        action,
        details,
        oldValues,
        newValues,
      },
    });
    console.log(`[AUDIT] ${action} on ${entityType} #${entityId}`);
  } catch (e) {
    console.error('[AUDIT FAILED]', e);
  }
}

module.exports = logAudit;
