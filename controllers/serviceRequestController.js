const prisma = require('../prisma/client');
const logAudit = require('../middleware/audit');
const { z } = require('zod');
const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const { sendExportEmail, sendNewClientEmail } = require('../utils/mailer');
const {
  TicketStatus,
  normalizeTicketStatus,
  optionalTicketStatusSchema,
} = require('../utils/ticketStatus');

const createTicketSchema = z.object({
  customerId: z.number().optional().nullable(),
  howReceived: z.string().optional().nullable(),
  clientConnection: z.string().optional().nullable(),
  requestType: z.string().optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  assignedTo: z.string().optional().nullable(),
  assignedCrewId: z.coerce.number().optional().nullable(),
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
  status: optionalTicketStatusSchema,
  proposalSentDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  scheduledWorkDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  scheduledEndDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  followUpDate: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  deadline: z.string().datetime().optional().nullable().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  isPremium: z.boolean().optional(),
  note: z.string().optional().nullable(),
  customerId: z.coerce.number().optional(),
  assignedTo: z.string().optional().nullable(),
  assignedCrewId: z.coerce.number().optional().nullable(),
  requestType: z.string().optional().nullable(),
  description: z.string().optional(),
});

const addNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
  customerId: z.coerce.number(),
});

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
      assignedCrewId,
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

      // Send email alert to admin
      const fullCust = await prisma.customer.findUnique({
        where: { id: newCust.id },
        include: { contacts: true }
      });
      sendNewClientEmail(fullCust).catch(e => console.error('Error sending new client email:', e));
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

      let finalAssignedTo = assignedTo;
      let finalAssignedCrewId = assignedCrewId;
      if (assignedCrewId !== undefined && assignedCrewId !== null) {
        const parsedCrewId = parseInt(assignedCrewId);
        const crew = await prisma.crew.findUnique({ where: { id: parsedCrewId } });
        if (crew) {
          finalAssignedTo = crew.name;
          finalAssignedCrewId = crew.id;
        }
      } else if (assignedTo !== undefined && assignedTo !== null && assignedTo !== 'Unassigned') {
        const crew = await prisma.crew.findUnique({ where: { name: assignedTo } });
        if (crew) {
          finalAssignedCrewId = crew.id;
          finalAssignedTo = crew.name;
        }
      }

      const request = await prisma.serviceRequest.create({
        data: {
          howReceived,
          clientConnection,
          requestType,
          description,
          assignedTo: finalAssignedTo,
          assignedCrewId: finalAssignedCrewId,
          customerId: parseInt(targetCustomerId),
          deadline: currentDeadline,
          isPremium: !!isPremium,
          scheduledWorkDate: currentStart,
          scheduledEndDate: currentEnd,
          status: currentStart ? TicketStatus.SCHEDULED : TicketStatus.UNSCHEDULED,
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
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
    next(e);
  }
};

exports.getOpenTickets = async (req, res, next) => {
  try {
    const { status, customerId } = req.query;
    const where = {};
    
    if (status) {
      if (status === 'ALL') {
        // do not restrict status
      } else {
        where.status = status;
      }
    } else {
      // Default to returning all active (non-archived) tickets
      where.status = { not: TicketStatus.ARCHIVED };
    }

    if (customerId) {
      where.customerId = parseInt(customerId);
    }

    const tickets = await prisma.serviceRequest.findMany({
      where,
      include: { customer: true },
      orderBy: { dateReceived: 'desc' },
    });
    res.json(tickets);
  } catch (e) {
    next(e);
  }
};

exports.getTicketById = async (req, res, next) => {
  const ticketId = parseInt(req.params.id);
  if (isNaN(ticketId)) {
    return res.status(400).json({ error: 'Invalid Ticket ID provided.' });
  }

  try {
    const ticket = await prisma.serviceRequest.findUnique({
      where: { id: ticketId },
      include: { 
        customer: {
          include: {
            addresses: true,
            siteSpec: true,
          }
        },
        attachments: true
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    res.json(ticket);
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
      assignedCrewId,
      requestType,
      description,
    } = validatedData;

    const oldTicket = await prisma.serviceRequest.findFirst({ 
      where: { id: ticketId } 
    });
    
    if (!oldTicket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    if (req.user && req.user.role === 'WORKER') {
      const forbiddenChanges = [];
      if (customerId !== undefined && customerId !== oldTicket.customerId) forbiddenChanges.push('customerId');
      if (assignedTo !== undefined && assignedTo !== oldTicket.assignedTo) forbiddenChanges.push('assignedTo');
      if (assignedCrewId !== undefined && assignedCrewId !== oldTicket.assignedCrewId) forbiddenChanges.push('assignedCrewId');
      if (requestType !== undefined && requestType !== oldTicket.requestType) forbiddenChanges.push('requestType');
      if (description !== undefined && description !== oldTicket.description) forbiddenChanges.push('description');
      if (isPremium !== undefined && isPremium !== oldTicket.isPremium) forbiddenChanges.push('isPremium');
      
      const oldSchedDate = oldTicket.scheduledWorkDate ? new Date(oldTicket.scheduledWorkDate).getTime() : null;
      const newSchedDate = scheduledWorkDate ? new Date(scheduledWorkDate).getTime() : null;
      if (scheduledWorkDate !== undefined && oldSchedDate !== newSchedDate) forbiddenChanges.push('scheduledWorkDate');

      const oldSchedEndDate = oldTicket.scheduledEndDate ? new Date(oldTicket.scheduledEndDate).getTime() : null;
      const newSchedEndDate = scheduledEndDate ? new Date(scheduledEndDate).getTime() : null;
      if (scheduledEndDate !== undefined && oldSchedEndDate !== newSchedEndDate) forbiddenChanges.push('scheduledEndDate');

      const oldDeadline = oldTicket.deadline ? new Date(oldTicket.deadline).getTime() : null;
      const newDeadline = deadline ? new Date(deadline).getTime() : null;
      if (deadline !== undefined && oldDeadline !== newDeadline) forbiddenChanges.push('deadline');

      const oldProposalDate = oldTicket.proposalSentDate ? new Date(oldTicket.proposalSentDate).getTime() : null;
      const newProposalDate = proposalSentDate ? new Date(proposalSentDate).getTime() : null;
      if (proposalSentDate !== undefined && oldProposalDate !== newProposalDate) forbiddenChanges.push('proposalSentDate');

      const oldFollowUpDate = oldTicket.followUpDate ? new Date(oldTicket.followUpDate).getTime() : null;
      const newFollowUpDate = followUpDate ? new Date(followUpDate).getTime() : null;
      if (followUpDate !== undefined && oldFollowUpDate !== newFollowUpDate) forbiddenChanges.push('followUpDate');

      if (forbiddenChanges.length > 0) {
        return res.status(403).json({ error: `Forbidden: Workers cannot modify fields: ${forbiddenChanges.join(', ')}` });
      }
    }

    const dataToUpdate = {};
    if (status !== undefined) dataToUpdate.status = status;
    if (proposalSentDate !== undefined) dataToUpdate.proposalSentDate = proposalSentDate ? new Date(proposalSentDate) : null;
    if (scheduledWorkDate !== undefined) dataToUpdate.scheduledWorkDate = scheduledWorkDate ? new Date(scheduledWorkDate) : null;
    if (scheduledEndDate !== undefined) dataToUpdate.scheduledEndDate = scheduledEndDate ? new Date(scheduledEndDate) : null;
    if (followUpDate !== undefined) dataToUpdate.followUpDate = followUpDate ? new Date(followUpDate) : null;
    if (deadline !== undefined) dataToUpdate.deadline = deadline ? new Date(deadline) : null;
    if (isPremium !== undefined) dataToUpdate.isPremium = !!isPremium;
    if (customerId !== undefined) dataToUpdate.customerId = customerId;
    if (requestType !== undefined) dataToUpdate.requestType = requestType;
    if (description !== undefined) dataToUpdate.description = description;

    if (assignedCrewId !== undefined) {
      dataToUpdate.assignedCrewId = assignedCrewId;
      if (assignedCrewId === null) {
        dataToUpdate.assignedTo = null;
      } else {
        const crew = await prisma.crew.findUnique({ where: { id: assignedCrewId } });
        if (crew) {
          dataToUpdate.assignedTo = crew.name;
        }
      }
    } else if (assignedTo !== undefined) {
      dataToUpdate.assignedTo = assignedTo;
      if (assignedTo === null || assignedTo === 'Unassigned') {
        dataToUpdate.assignedCrewId = null;
      } else {
        const crew = await prisma.crew.findUnique({ where: { name: assignedTo } });
        if (crew) {
          dataToUpdate.assignedCrewId = crew.id;
        }
      }
    }

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

    if (status === TicketStatus.DONE && oldTicket.status !== TicketStatus.DONE) {
      try {
        const customer = await prisma.customer.findFirst({
          where: { id: oldTicket.customerId },
          include: { contacts: true }
        });
        if (customer && customer.contacts.length > 0) {
          const primaryContact = customer.contacts.find(c => c.isPrimary) || customer.contacts[0];
          if (primaryContact.email) {
            const reqAttachments = await prisma.attachment.findMany({
              where: { serviceRequestId: ticketId }
            });
            const { sendJobCompletionEmail } = require('../utils/mailer');
            await sendJobCompletionEmail(primaryContact.email, customer.displayName, ticketId, oldTicket.description, note, reqAttachments);
          }
          if (primaryContact.phone) {
            console.log(`[SMS SENT] to ${primaryContact.phone} (${customer.displayName}): Proscape Job #${ticketId} has been marked DONE. Details: ${note || 'None'}`);
          }
        }
      } catch (err) {
        console.error('Failed to send auto completion alerts:', err);
      }
    }

    let auditDetails = '';
    if (status !== undefined && status !== oldTicket.status) auditDetails += `Status changed to ${status}. `;
    if (proposalSentDate !== undefined && proposalSentDate !== oldTicket.proposalSentDate) auditDetails += `Proposal set for ${proposalSentDate}. `;
    if (scheduledWorkDate !== undefined && scheduledWorkDate !== oldTicket.scheduledWorkDate) auditDetails += `Work scheduled for ${scheduledWorkDate}. `;
    if (note) auditDetails += `Added field log note.`;
    if (!auditDetails) auditDetails = `Updated ticket details.`;

    await logAudit(
      'TICKET',
      ticketId,
      'MILESTONE_UPDATE',
      auditDetails,
      oldTicket,
      updatedTicket,
      req.user ? req.user.userId || req.user.id : null,
      req.user ? req.user.role : null
    );
    res.json(updatedTicket);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Validation Error', details: e.errors });
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
    const { start, end } = req.query;
    const where = {};
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      where.OR = [
        {
          scheduledWorkDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        {
          AND: [
            { scheduledWorkDate: { lte: endDate } },
            { scheduledEndDate: { gte: startDate } },
          ],
        },
        {
          proposalSentDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        {
          followUpDate: {
            gte: startDate,
            lte: endDate,
          },
        },
      ];
    }

    const tickets = await prisma.serviceRequest.findMany({
      where,
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
        ticket.status !== TicketStatus.DONE &&
        ticket.status !== TicketStatus.SCHEDULED &&
        ticket.deadline &&
        new Date(ticket.deadline) < today;

      const baseProps = {
        ticketId: ticket.id,
        customerId: ticket.customerId,
        customerName: ticket.customer?.displayName || 'Unknown',
        requestType: ticket.requestType || 'Standard Request',
        assignedTo: ticket.assignedTo || 'Unassigned',
        description: ticket.description,
        siteSpec: ticket.customer?.siteSpec,
        status: ticket.status,
        deadline: ticket.deadline,
        isPremium: ticket.isPremium,
        isOverdue: isOverdue,
        attachments: ticket.attachments,
        addresses: ticket.customer?.addresses,
      };

      if (ticket.followUpDate) {
        events.push({
          title: `${premiumPrefix}📞 Follow Up: ${ticket.customer?.displayName}`,
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
          const jobInfo = ticket.description
            ? ticket.description.substring(0, 50) + '...'
            : 'No details';
          displayTitle = `${premiumPrefix}${icon} ${ticket.customer?.displayName}\n📝 ${jobInfo}`;
        }

        let endVal = undefined;
        if (ticket.scheduledEndDate) {
          const endDate = new Date(ticket.scheduledEndDate);
          endDate.setDate(endDate.getDate() + 1);
          endVal = endDate.toISOString().split('T')[0];
        }

        events.push({
          title: displayTitle,
          start: ticket.scheduledWorkDate.toISOString().split('T')[0],
          end: endVal,
          backgroundColor: isNote ? '#64748b' : '#166534',
          borderColor: isOverdue ? '#dc2626' : isNote ? '#475569' : '#14532d',
          classNames: isOverdue ? ['overdue-pulse'] : [],
          extendedProps: { ...baseProps, eventType: isNote ? 'Calendar Note' : 'Scheduled Work' },
        });
      }

      if (ticket.proposalSentDate) {
        events.push({
          title: `${premiumPrefix}📄 Prop: ${ticket.customer?.displayName}`,
          start: ticket.proposalSentDate.toISOString().split('T')[0],
          backgroundColor: '#2563eb',
          borderColor: '#1d4ed8',
          extendedProps: { ...baseProps, eventType: 'Proposal Sent' },
        });
      }
    });

    // Fetch and include Calendar Notes
    const noteWhere = {};
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      noteWhere.OR = [
        {
          startDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        {
          AND: [
            { startDate: { lte: endDate } },
            { endDate: { gte: startDate } },
          ],
        },
      ];
    }
    const calendarNotes = await prisma.calendarNote.findMany({ where: noteWhere });
    calendarNotes.forEach((note) => {
      const noteTypeEmojis = {
        DELIVERY: '🚚',
        VACATION: '🌴',
        EVENT: '🎉',
        OTHER: '📌',
      };
      const icon = noteTypeEmojis[note.noteType] || '📌';

      let endVal = undefined;
      if (note.endDate) {
        const endDate = new Date(note.endDate);
        endDate.setDate(endDate.getDate() + 1);
        endVal = endDate.toISOString().split('T')[0];
      }

      const noteColors = {
        DELIVERY: { bg: '#f59e0b', border: '#d97706' },
        VACATION: { bg: '#06b6d4', border: '#0891b2' },
        EVENT: { bg: '#8b5cf6', border: '#7c3aed' },
        OTHER: { bg: '#64748b', border: '#475569' },
      };
      const colors = noteColors[note.noteType] || noteColors.OTHER;

      events.push({
        id: `note-${note.id}`,
        title: `${icon} ${note.title}`,
        start: note.startDate.toISOString().split('T')[0],
        end: endVal,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        textColor: '#ffffff',
        extendedProps: {
          noteId: note.id,
          title: note.title,
          description: note.description,
          noteType: note.noteType,
          eventType: 'Calendar Note',
        },
      });
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

exports.bulkShiftTickets = async (req, res, next) => {
  const { crew, days } = req.body;
  if (!crew || days === undefined) return res.status(400).json({ error: 'Crew and days required.' });

  const shiftAmount = parseInt(days);
  if (isNaN(shiftAmount)) return res.status(400).json({ error: 'Days must be a valid number.' });

  try {
    const whereClause = {
      status: { in: [TicketStatus.UNSCHEDULED, TicketStatus.SCHEDULED] },
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

    const updates = tickets.map((t) => {
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
    next(e);
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

    const flattened = tickets.map(t => ({
      id: t.id,
      dateReceived: t.dateReceived,
      customerName: t.customer?.displayName || 'Unknown',
      requestType: t.requestType,
      description: t.description,
      assignedTo: t.assignedTo,
      status: t.status,
      deadline: t.deadline,
      isPremium: t.isPremium,
      scheduledWorkDate: t.scheduledWorkDate,
      scheduledEndDate: t.scheduledEndDate,
    }));

    const fields = [
      'id',
      'dateReceived',
      'customerName',
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
    const csvData = parser.parse(flattened);

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
              status: normalizeTicketStatus(job.status),
              isPremium: job.isPremium === 'true' || job.isPremium === '1',
              scheduledWorkDate: job.scheduledWorkDate ? new Date(job.scheduledWorkDate) : null,
              deadline: job.deadline ? new Date(job.deadline) : null,
            },
          });
          createdCount++;
        }

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

exports.bulkManualEntry = async (req, res, next) => {
  const payload = req.body; // Array of items
  if (!Array.isArray(payload)) return res.status(400).json({ error: 'Payload must be an array' });

  try {
    let createdCount = 0;
    for (const item of payload) {
      if (!item.customerId || !item.description) continue;
      await prisma.serviceRequest.create({
        data: {
          customerId: parseInt(item.customerId),
          description: item.description,
          requestType: item.requestType || 'Standard Service',
          assignedTo: item.assignedTo || 'Unassigned',
          status: TicketStatus.UNSCHEDULED
        }
      });
      createdCount++;
    }

    await logAudit('BATCH', 0, 'MANUAL_BULK_ENTRY', `Manually created ${createdCount} tickets in bulk.`);
    res.json({ success: true, count: createdCount });
  } catch (e) {
    next(e);
  }
};
