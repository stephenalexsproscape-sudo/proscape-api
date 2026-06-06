const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');
const { z } = require('zod');

const missingInfoQuerySchema = z.object({
  type: z.enum(['email', 'phone']).optional(),
});

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
      where: {
        contacts: {
          none: {
            AND: [
              { email: { not: null } },
              { email: { not: '' } }
            ]
          }
        }
      }
    });

    // Customers missing phones
    const missingPhoneCount = await prisma.customer.count({
      where: {
        contacts: {
          none: {
            AND: [
              { phone: { not: null } },
              { phone: { not: '' } }
            ]
          }
        }
      }
    });

    res.json({
      totalCustomers: total,
      missingEmail: missingEmailCount,
      missingPhone: missingPhoneCount,
      overallHealth: total > 0 ? Math.round(((total - missingEmailCount) / total) * 100) : 0
    });
  } catch (e) {
    next(e);
  }
};

exports.getMissingInfoCustomers = async (req, res, next) => {
  try {
    const { type } = missingInfoQuerySchema.parse(req.query);
    const where = {};
    if (type === 'email') {
      where.contacts = {
        none: {
          AND: [
            { email: { not: null } },
            { email: { not: '' } }
          ]
        }
      };
    } else if (type === 'phone') {
      where.contacts = {
        none: {
          AND: [
            { phone: { not: null } },
            { phone: { not: '' } }
          ]
        }
      };
    }

    const customers = await prisma.customer.findMany({
      where,
      include: { contacts: true },
      take: 50,
      orderBy: { displayName: 'asc' }
    });
    res.json(customers);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};
