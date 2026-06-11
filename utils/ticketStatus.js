const { z } = require('zod');

const TicketStatus = Object.freeze({
  UNSCHEDULED: 'UNSCHEDULED',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  SCHEDULED: 'SCHEDULED',
  DONE: 'DONE',
  ARCHIVED: 'ARCHIVED',
});

const TICKET_STATUS_VALUES = Object.values(TicketStatus);

const LEGACY_STATUS_MAP = {
  OPEN: TicketStatus.UNSCHEDULED,
  CLOSED: TicketStatus.SCHEDULED,
  COMPLETED: TicketStatus.DONE,
  SCHEDULED: TicketStatus.SCHEDULED,
};

function normalizeTicketStatus(status) {
  if (status === undefined || status === null || status === '') {
    return TicketStatus.UNSCHEDULED;
  }

  const upper = String(status).trim().toUpperCase();
  if (LEGACY_STATUS_MAP[upper]) return LEGACY_STATUS_MAP[upper];
  if (TICKET_STATUS_VALUES.includes(upper)) return upper;
  return TicketStatus.UNSCHEDULED;
}

const optionalTicketStatusSchema = z.preprocess(
  (val) => (val === undefined || val === null ? undefined : normalizeTicketStatus(val)),
  z.enum(TICKET_STATUS_VALUES).optional()
);

module.exports = {
  TicketStatus,
  TICKET_STATUS_VALUES,
  LEGACY_STATUS_MAP,
  normalizeTicketStatus,
  optionalTicketStatusSchema,
};