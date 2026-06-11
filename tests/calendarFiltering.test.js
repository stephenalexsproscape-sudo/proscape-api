const request = require('supertest');
const app = require('../index');
const prisma = require('../prisma/client');

describe('Calendar Filtering API', () => {
  let authToken;
  let testCustomer;
  let inRangeTicket;
  let outOfRangeTicket;

  beforeAll(async () => {
    // 1. Get auth token
    const res = await request(app)
      .post('/login')
      .send({ username: 'admin', password: '55255525' });
    
    if (res.statusCode === 200) {
      authToken = res.body.token;
    }

    // 2. Find or create a test customer
    testCustomer = await prisma.customer.findFirst();
    if (!testCustomer) {
      testCustomer = await prisma.customer.create({
        data: { displayName: 'Calendar Filter Customer' },
      });
    }

    // 3. Create a ticket in the range (June 15, 2026)
    inRangeTicket = await prisma.serviceRequest.create({
      data: {
        customerId: testCustomer.id,
        description: 'In Range Job',
        scheduledWorkDate: new Date('2026-06-15T00:00:00.000Z'),
        status: 'SCHEDULED',
      },
    });

    // 4. Create a ticket outside the range (July 15, 2026)
    outOfRangeTicket = await prisma.serviceRequest.create({
      data: {
        customerId: testCustomer.id,
        description: 'Out of Range Job',
        scheduledWorkDate: new Date('2026-07-15T00:00:00.000Z'),
        status: 'SCHEDULED',
      },
    });
  });

  afterAll(async () => {
    if (inRangeTicket) {
      await prisma.serviceRequest.delete({ where: { id: inRangeTicket.id } }).catch(() => {});
    }
    if (outOfRangeTicket) {
      await prisma.serviceRequest.delete({ where: { id: outOfRangeTicket.id } }).catch(() => {});
    }
  });

  it('GET /calendar-events should return all events if start/end parameters are missing', async () => {
    const res = await request(app)
      .get('/calendar-events')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    const ids = res.body.map(e => e.extendedProps?.ticketId);
    expect(ids).toContain(inRangeTicket.id);
    expect(ids).toContain(outOfRangeTicket.id);
  });

  it('GET /calendar-events should filter events based on start and end date parameters', async () => {
    const res = await request(app)
      .get('/calendar-events?start=2026-06-10&end=2026-06-20')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    const ids = res.body.map(e => e.extendedProps?.ticketId);
    
    // Should contain the one scheduled for June 15
    expect(ids).toContain(inRangeTicket.id);
    
    // Should NOT contain the one scheduled for July 15
    expect(ids).not.toContain(outOfRangeTicket.id);
  });
});
