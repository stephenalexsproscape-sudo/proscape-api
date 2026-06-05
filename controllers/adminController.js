const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');

exports.archiveOldTickets = async (req, res, next) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const ticketsToArchive = await prisma.serviceRequest.findMany({
      where: {
        status: { in: ['CLOSED', 'COMPLETED'] },
        scheduledWorkDate: { lt: thirtyDaysAgo },
      },
    });

    const count = ticketsToArchive.length;

    if (count > 0) {
      await prisma.serviceRequest.updateMany({
        where: {
          id: { in: ticketsToArchive.map((t) => t.id) },
        },
        data: { status: 'ARCHIVED' },
      });

      await logAudit(
        'BATCH',
        0,
        'AUTO_ARCHIVE',
        `Archived ${count} tickets older than 30 days.`
      );
    }

    res.json({ success: true, archivedCount: count });
  } catch (e) {
    next(e);
  }
};

exports.getAuditLog = async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (e) {
    next(e);
  }
};

exports.getDataQualityStats = async (req, res, next) => {
  try {
    const total = await prisma.customer.count();
    
    // Customers missing emails (checked via contacts)
    const missingEmailCount = await prisma.customer.count({
      where: { contacts: { none: { email: { not: null, not: '' } } } }
    });

    // Customers missing phones
    const missingPhoneCount = await prisma.customer.count({
      where: { contacts: { none: { phone: { not: null, not: '' } } } }
    });

    res.json({
      totalCustomers: total,
      missingEmail: missingEmailCount,
      missingPhone: missingPhoneCount,
      overallHealth: Math.round(((total - missingEmailCount) / total) * 100)
    });
  } catch (e) {
    next(e);
  }
};

exports.getMissingInfoCustomers = async (req, res, next) => {
  const { type } = req.query; // 'email' or 'phone'
  try {
    const where = {};
    if (type === 'email') {
      where.contacts = { none: { email: { not: null, not: '' } } };
    } else if (type === 'phone') {
      where.contacts = { none: { phone: { not: null, not: '' } } };
    }

    const customers = await prisma.customer.findMany({
      where,
      include: { contacts: true },
      take: 50,
      orderBy: { displayName: 'asc' }
    });
    res.json(customers);
  } catch (e) {
    next(e);
  }
};
