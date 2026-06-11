const {
  TicketStatus,
  normalizeTicketStatus,
} = require('../utils/ticketStatus');

describe('ticket status normalization', () => {
  it('maps legacy status codes to canonical enum values', () => {
    expect(normalizeTicketStatus('OPEN')).toBe(TicketStatus.UNSCHEDULED);
    expect(normalizeTicketStatus('CLOSED')).toBe(TicketStatus.SCHEDULED);
    expect(normalizeTicketStatus('COMPLETED')).toBe(TicketStatus.DONE);
  });

  it('preserves canonical enum values', () => {
    expect(normalizeTicketStatus('UNSCHEDULED')).toBe(TicketStatus.UNSCHEDULED);
    expect(normalizeTicketStatus('SCHEDULED')).toBe(TicketStatus.SCHEDULED);
    expect(normalizeTicketStatus('DONE')).toBe(TicketStatus.DONE);
    expect(normalizeTicketStatus('PROPOSAL_SENT')).toBe(TicketStatus.PROPOSAL_SENT);
    expect(normalizeTicketStatus('ARCHIVED')).toBe(TicketStatus.ARCHIVED);
  });

  it('defaults unknown values to UNSCHEDULED', () => {
    expect(normalizeTicketStatus('')).toBe(TicketStatus.UNSCHEDULED);
    expect(normalizeTicketStatus('MYSTERY')).toBe(TicketStatus.UNSCHEDULED);
  });
});