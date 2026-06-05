const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');
const { z } = require('zod');

const createTicketSchema = z.object({
  customerId: z.number().optional().nullable(),
  howReceived: z.string().optional().nullable(),
  clientConnection: z.string().optional().nullable(),
  requestType: z.string().optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  assignedTo: z.string().optional().nullable(),
  isNewClient: z.boolean().optional(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  updateMaster: z.boolean().optional(),
  deadline: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  isPremium: z.boolean().optional(),
  scheduledWorkDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  scheduledEndDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  repeatCount: z.coerce.number().optional(),
  repeatType: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
});

const updateTicketSchema = z.object({
  status: z.string().optional(),
  proposalSentDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  scheduledWorkDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  scheduledEndDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  followUpDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  deadline: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  isPremium: z.boolean().optional(),
  note: z.string().optional().nullable(),
  customerId: z.coerce.number().optional(),
  assignedTo: z.string().optional().nullable(),
  requestType: z.string().optional().nullable(),
  description: z.string().optional(),
});

const addNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
  customerId: z.coerce.number(),
});

exports.addNote = async (req, res, next) => {
  try {
    const validatedData = addNoteSchema.parse(req.body);
    const { content, customerId } = validatedData;

    const userId = parseInt(req.user.userId);
    const user = !isNaN(userId) ? await prisma.user.findUnique({
      where: { id: userId },
    }) : null;

    const newNote = await prisma.message.create({
      data: {
        content,
        customerId: customerId,
        author: user ? user.username : 'Unknown',
      },
    });

    res.json(newNote);
  } catch (e) {
    next(e);
  }
};

exports.createServiceRequest = async (req, res, next) => {
  try {
    const validatedData = createTicketSchema.parse(req.body);
    const {
      customerId,
      howReceived,
      clientConnection,
      requestType,
      description,
      assignedTo,
      isNewClient,
      firstName,
      lastName,
      phone,
      email,
      updateMaster,
      deadline,
      isPremium,
      scheduledWorkDate,
      scheduledEndDate,
      repeatCount,
      repeatType,
    } = validatedData;

    let targetCustomerId = customerId;

    if (isNewClient) {
      const finalDisplayName = lastName && firstName ? `${lastName}, ${firstName}` : (lastName || firstName || 'New Client');
      const newCust = await prisma.customer.create({
        data: {
          displayName: finalDisplayName,
          contacts: {
            create: { firstName, lastName, phone, email, isPrimary: true },
          },
        },
      });
      targetCustomerId = newCust.id;
      await logAudit(
        'CUSTOMER',
        targetCustomerId,
        'CREATED_FROM_INTAKE',
        `Created new record: ${finalDisplayName}`
      );
    } else if (updateMaster && targetCustomerId) {
      const primaryContact = await prisma.contact.findFirst({
        where: { customerId: parseInt(targetCustomerId), isPrimary: true },
      });
      if (primaryContact) {
        await prisma.contact.update({
          where: { id: primaryContact.id },
          data: {
            phone: phone || primaryContact.phone,
            email: email || primaryContact.email,
          },
        });
        await logAudit(
          'CUSTOMER',
          targetCustomerId,
          'MASTER_OVERRIDE',
          `Contact info updated via Lead Intake.`
        );
      }
    }

    const count = repeatCount || 1;
    const type = repeatType || 'none';
    const createdTickets = [];

    for (let i = 0; i < count; i++) {
      let currentStart = null;
      let currentEnd = null;
      let currentDeadline = null;

      if (scheduledWorkDate) {
        const baseStart = new Date(scheduledWorkDate);
        if (type === 'daily') currentStart = addBusinessDays(baseStart, i);
        else if (type === 'weekly') {
          currentStart = new Date(baseStart);
          currentStart.setDate(baseStart.getDate() + i * 7);
        } else if (type === 'monthly') {
          currentStart = new Date(baseStart);
          currentStart.setMonth(baseStart.getMonth() + i);
        } else {
          currentStart = baseStart;
        }

        if (scheduledEndDate) {
          const baseEnd = new Date(scheduledEndDate);
          const baseStartObj = new Date(scheduledWorkDate);
          const duration = Math.round(
            (baseEnd - baseStartObj) / (1000 * 60 * 60 * 24)
          );
          currentEnd = new Date(currentStart);
          currentEnd.setDate(currentStart.getDate() + duration);
        }
      }

      if (deadline) {
        const baseDeadline = new Date(deadline);
        if (type === 'daily') currentDeadline = addBusinessDays(baseDeadline, i);
        else if (type === 'weekly') {
          currentDeadline = new Date(baseDeadline);
          currentDeadline.setDate(baseDeadline.getDate() + i * 7);
        } else if (type === 'monthly') {
          currentDeadline = new Date(baseDeadline);
          currentDeadline.setMonth(baseDeadline.getMonth() + i);
        } else {
          currentDeadline = baseDeadline;
        }
      }

      const request = await prisma.serviceRequest.create({
        data: {
          howReceived,
          clientConnection,
          requestType,
          description,
          assignedTo,
          customerId: parseInt(targetCustomerId),
          deadline: currentDeadline,
          isPremium: !!isPremium,
          scheduledWorkDate: currentStart,
          scheduledEndDate: currentEnd,
          status: currentStart ? 'CLOSED' : 'OPEN', // Auto-close if scheduled
        },
      });
      createdTickets.push(request);
    }

    await logAudit(
      'TICKET',
      createdTickets[0].id,
      'CREATED_RECURRING',
      `Created ${createdTickets.length} tickets for customer #${targetCustomerId}.`
    );
    res.json(createdTickets.length === 1 ? createdTickets[0] : createdTickets);
  } catch (e) {
    next(e);
  }
};

exports.getOpenTickets = async (req, res, next) => {
  try {
    const tickets = await prisma.serviceRequest.findMany({
      where: { status: 'OPEN' },
      include: { customer: true },
      orderBy: { dateReceived: 'desc' },
    });
    res.json(tickets);
  } catch (e) {
    next(e);
  }
};

exports.getTicketAuditLogs = async (req, res, next) => {
  const ticketId = parseInt(req.params.id);
  if (isNaN(ticketId)) return res.json([]);
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'TICKET', entityId: ticketId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs);
  } catch (e) {
    next(e);
  }
};


exports.updateTicket = async (req, res, next) => {
  const ticketId = parseInt(req.params.id);
  
  if (isNaN(ticketId)) {
    return res.status(400).json({ error: 'Invalid Ticket ID provided.' });
  }

  try {
    const validatedData = updateTicketSchema.parse(req.body);
    const {
      status,
      proposalSentDate,
      scheduledWorkDate,
      scheduledEndDate,
      followUpDate,
      deadline,
      isPremium,
      note,
      customerId,
      assignedTo,
      requestType,
      description,
    } = validatedData;

    // findFirst is less strict than findUnique regarding unique filter presence
    const oldTicket = await prisma.serviceRequest.findFirst({ 
      where: { id: ticketId } 
    });
    
    if (!oldTicket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const dataToUpdate = {
      status: status || 'OPEN',
      proposalSentDate: proposalSentDate ? new Date(proposalSentDate) : null,
      scheduledWorkDate: scheduledWorkDate ? new Date(scheduledWorkDate) : null,
      scheduledEndDate: scheduledEndDate ? new Date(scheduledEndDate) : null,
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      deadline: deadline ? new Date(deadline) : null,
      isPremium: isPremium !== undefined ? !!isPremium : undefined,
    };
    
    if (customerId) dataToUpdate.customerId = customerId;
    if (assignedTo !== undefined) dataToUpdate.assignedTo = assignedTo;
    if (requestType !== undefined) dataToUpdate.requestType = requestType;
    if (description !== undefined) dataToUpdate.description = description;

    const updatedTicket = await prisma.serviceRequest.update({
      where: { id: ticketId },
      data: dataToUpdate,
    });

    if (note && note.trim() !== '') {
      await prisma.message.create({
        data: {
          content: `[TICKET #${ticketId} UPDATE] ${note}`,
          customerId: customerId || oldTicket.customerId,
        },
      });
    }

    let auditDetails = `Status changed to ${status}. `;
    if (proposalSentDate) auditDetails += `Proposal set for ${proposalSentDate}. `;
    if (scheduledWorkDate) auditDetails += `Work scheduled for ${scheduledWorkDate}. `;
    if (note) auditDetails += `Added field log note.`;

    await logAudit(
      'TICKET',
      ticketId,
      'MILESTONE_UPDATE',
      auditDetails,
      oldTicket,
      updatedTicket
    );
    res.json(updatedTicket);
  } catch (e) {
    next(e);
  }
};

exports.deleteServiceRequest = async (req, res, next) => {
  const ticketId = parseInt(req.params.id);
  if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await prisma.serviceRequest.delete({
      where: { id: ticketId },
    });

    await logAudit('TICKET', ticketId, 'DELETED', `Deleted entry via Job Board`);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

const requestTypeIcons = {
  Mowing: '🚜',
  'Snow Removal': '❄️',
  Hardscape: '🧱',
  'RFP: Wants to meet': '🤝',
  'RFP: Send proposal': '📄',
  'Call back requested': '📞',
  'Standard Service': '🛠️',
  'Calendar Note': '📌',
};

exports.getCalendarEvents = async (req, res, next) => {
  try {
    const tickets = await prisma.serviceRequest.findMany({
      include: {
        customer: {
          include: {
            addresses: true,
            siteSpec: true,
          },
        },
        attachments: true,
      },
    });

    const events = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tickets.forEach((ticket) => {
      const icon = requestTypeIcons[ticket.requestType] || '';
      const premiumPrefix = ticket.isPremium ? '⭐ ' : '';
      const isOverdue =
        ticket.status !== 'COMPLETED' &&
        ticket.status !== 'CLOSED' &&
        ticket.deadline &&
        new Date(ticket.deadline) < today;

      const baseProps = {
        ticketId: ticket.id,
        customerId: ticket.customerId,
        customerName: ticket.customer.displayName,
        requestType: ticket.requestType || 'Standard Request',
        assignedTo: ticket.assignedTo || 'Unassigned',
        description: ticket.description,
        siteSpec: ticket.customer.siteSpec,
        status: ticket.status,
        deadline: ticket.deadline,
        isPremium: ticket.isPremium,
        isOverdue: isOverdue,
        attachments: ticket.attachments,
        addresses: ticket.customer.addresses,
      };

      if (ticket.followUpDate) {
        events.push({
          title: `${premiumPrefix}📞 Follow Up: ${ticket.customer.displayName}`,
          start: ticket.followUpDate.toISOString().split('T')[0],
          backgroundColor: '#d97706',
          borderColor: '#b45309',
          extendedProps: { ...baseProps, eventType: 'Follow Up' },
        });
      }

      if (ticket.scheduledWorkDate) {
        const isNote = ticket.requestType === 'Calendar Note';
        let displayTitle;

        if (isNote) {
          displayTitle = `${premiumPrefix}${icon} ${ticket.description || 'Note'}`;
        } else {
          const addr =
            ticket.customer?.addresses?.find((a) => a.type === 'SERVICE')?.street1 || 'No Address';
          const jobInfo = ticket.description
            ? ticket.description.substring(0, 50) + '...'
            : 'No details';
          displayTitle = `${premiumPrefix}${icon} ${ticket.customer.displayName}\n📍 ${addr}\n📝 ${jobInfo}`;
        }

        events.push({
          title: displayTitle,
          start: ticket.scheduledWorkDate.toISOString().split('T')[0],
          end: ticket.scheduledEndDate
            ? ticket.scheduledEndDate.toISOString().split('T')[0]
            : undefined,
          backgroundColor: isNote ? '#64748b' : '#166534',
          borderColor: isOverdue ? '#dc2626' : isNote ? '#475569' : '#14532d',
          classNames: isOverdue ? ['overdue-pulse'] : [],
          extendedProps: { ...baseProps, eventType: isNote ? 'Calendar Note' : 'Scheduled Work' },
        });
      }

      if (ticket.proposalSentDate) {
        events.push({
          title: `${premiumPrefix}📄 Prop: ${ticket.customer.displayName}`,
          start: ticket.proposalSentDate.toISOString().split('T')[0],
          backgroundColor: '#2563eb',
          borderColor: '#1d4ed8',
          extendedProps: { ...baseProps, eventType: 'Proposal Sent' },
        });
      }
    });

    res.json(events);
  } catch (e) {
    next(e);
  }
};

exports.getRecentActivity = async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    res.json(logs);
  } catch (e) {
    next(e);
  }
};

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  const direction = days > 0 ? 1 : -1;
  const absDays = Math.abs(days);
  while (added < absDays) {
    result.setDate(result.getDate() + direction);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++;
    }
  }
  return result;
}

exports.bulkShiftTickets = async (req, res, next) => {
  const { crew, days } = req.body;
  if (!crew || days === undefined) return res.status(400).json({ error: 'Crew and days required.' });

  const shiftAmount = parseInt(days);
  if (isNaN(shiftAmount)) return res.status(400).json({ error: 'Days must be a valid number.' });

  try {
    const whereClause = {
      status: { in: ['OPEN', 'CLOSED'] },
      scheduledWorkDate: { not: null },
    };

    if (crew === 'Unassigned') {
      whereClause.assignedTo = { in: [null, 'Unassigned'] };
    } else if (crew !== 'ALL') {
      whereClause.assignedTo = crew;
    }

    const tickets = await prisma.serviceRequest.findMany({
      where: whereClause,
    });

    if (tickets.length === 0) {
      return res.json({ success: true, count: 0, message: 'No jobs found to shift.' });
    }

    const updates = tickets
      .filter(t => t.id)
      .map((t) => {
        const newStart = addBusinessDays(t.scheduledWorkDate, shiftAmount);
        let newEnd = null;

        if (t.scheduledEndDate && !isNaN(new Date(t.scheduledEndDate).getTime())) {
          const start = new Date(t.scheduledWorkDate);
          const end = new Date(t.scheduledEndDate);
          const durationMs = end.getTime() - start.getTime();
          newEnd = new Date(newStart.getTime() + durationMs);
        }

        return prisma.serviceRequest.update({
          where: { id: t.id },
          data: {
            scheduledWorkDate: newStart,
            scheduledEndDate: newEnd,
          },
        });
      });

    await Promise.all(updates);

    await logAudit(
      'BATCH',
      0,
      'RAIN_DELAY_SHIFT',
      `Shifted ${tickets.length} tickets for ${crew} by ${shiftAmount} business days.`
    );
    res.json({ success: true, count: tickets.length });
  } catch (e) {
    console.error('[BULK SHIFT ERROR]', e);
    res.status(500).json({ error: e.message || 'Failed to shift schedule.' });
  }
};

exports.uploadAttachment = async (req, res, next) => {
  const { id } = req.params;
  const ticketId = parseInt(id);
  if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid Ticket ID' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const attachment = await prisma.attachment.create({
      data: {
        serviceRequestId: ticketId,
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
      },
    });

    await logAudit('TICKET', ticketId, 'ATTACHMENT_UPLOADED', `Uploaded file: ${req.file.originalname}`);
    res.json(attachment);
  } catch (e) {
    next(e);
  }
};

exports.deleteAttachment = async (req, res, next) => {
  const { id } = req.params;
  const attachmentId = parseInt(id);
  if (isNaN(attachmentId)) return res.status(400).json({ error: 'Invalid Attachment ID' });
  
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found.' });

    await prisma.attachment.delete({ where: { id: attachmentId } });

    await logAudit('TICKET', attachment.serviceRequestId, 'ATTACHMENT_DELETED', `Deleted file: ${attachment.fileName}`);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
};

exports.exportJobs = async (req, res, next) => {
  try {
    const tickets = await prisma.serviceRequest.findMany({
      include: { customer: true },
      orderBy: { dateReceived: 'desc' },
    });

    const fields = [
      'id',
      'dateReceived',
      'customer.displayName',
      'requestType',
      'description',
      'assignedTo',
      'status',
      'deadline',
      'isPremium',
      'scheduledWorkDate',
      'scheduledEndDate',
    ];
    const opts = { fields };
    const parser = new Parser(opts);
    const csvData = parser.parse(tickets);

    await sendExportEmail(csvData);

    res.json({ success: true, message: 'Export sent to admin email.' });
  } catch (e) {
    next(e);
  }
};

exports.importJobs = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });

  const jobs = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => jobs.push(row))
    .on('end', async () => {
      try {
        let createdCount = 0;
        for (const job of jobs) {
          const customerId = parseInt(job.customerId);
          if (isNaN(customerId)) continue;

          await prisma.serviceRequest.create({
            data: {
              customerId,
              description: job.description || 'Imported Job',
              requestType: job.requestType || 'Standard Service',
              assignedTo: job.assignedTo || 'Unassigned',
              status: job.status || 'OPEN',
              isPremium: job.isPremium === 'true' || job.isPremium === '1',
              scheduledWorkDate: job.scheduledWorkDate ? new Date(job.scheduledWorkDate) : null,
              deadline: job.deadline ? new Date(job.deadline) : null,
            },
          });
          createdCount++;
        }

        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        await logAudit('BATCH', 0, 'JOB_IMPORT', `Batch imported ${createdCount} jobs from CSV.`);
        res.json({ success: true, count: createdCount });
      } catch (e) {
        next(e);
      }
    })
    .on('error', (err) => {
      next(err);
    });
};
