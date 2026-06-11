const prisma = require('../prisma/client'); // Use singleton for connection pooling / best practice

async function logAudit(entityType, entityId, action, details, oldValues = null, newValues = null, userId = null, userRole = null) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType,
        entityId: parseInt(entityId),
        action,
        details,
        oldValues,
        newValues,
        userId: userId ? parseInt(userId) : null,
        userRole: userRole || null,
      },
    });
    console.log(`[AUDIT] ${action} on ${entityType} #${entityId} by user #${userId || 'System'}`);
  } catch (e) {
    console.error('[AUDIT FAILED]', e);
  }
}

module.exports = logAudit;
