const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');
const { z } = require('zod');
const { TicketStatus } = require('../utils/ticketStatus');

const missingInfoQuerySchema = z.object({
  type: z.enum(['email', 'phone']).optional(),
});

exports.archiveOldTickets = async (req, res, next) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const ticketsToArchive = await prisma.serviceRequest.findMany({
      where: {
        status: { in: [TicketStatus.SCHEDULED, TicketStatus.DONE] },
        scheduledWorkDate: { lt: thirtyDaysAgo },
      },
    });

    const count = ticketsToArchive.length;

    if (count > 0) {
      await prisma.serviceRequest.updateMany({
        where: {
          id: { in: ticketsToArchive.map((t) => t.id) },
        },
        data: { status: TicketStatus.ARCHIVED },
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count(),
    ]);

    res.setHeader('X-Total-Count', total);
    res.setHeader('X-Page', page);
    res.setHeader('X-Limit', limit);
    res.setHeader('X-Total-Pages', Math.ceil(total / limit));
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Page, X-Limit, X-Total-Pages');

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
