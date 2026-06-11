const request = require('supertest');
const app = require('../index');
const prisma = require('../prisma/client');

describe('Ticket PATCH and GET by ID endpoints', () => {
  let authToken;
  let testTicket;
  let testCustomer;

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
        data: { displayName: 'Test Customer' },
      });
    }

    // 3. Create a test ticket that is scheduled
    testTicket = await prisma.serviceRequest.create({
      data: {
        customerId: testCustomer.id,
        description: 'Original Description',
        status: 'SCHEDULED',
        scheduledWorkDate: new Date('2026-06-15T00:00:00.000Z'),
        assignedTo: 'Crew A',
      },
    });
  });

  afterAll(async () => {
    // Cleanup the ticket we created
    if (testTicket) {
      await prisma.serviceRequest.delete({
        where: { id: testTicket.id },
      }).catch(() => {});
    }
  });

  it('GET /service-requests/:id returns the exact ticket details', async () => {
    const res = await request(app)
      .get(`/service-requests/${testTicket.id}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(testTicket.id);
    expect(res.body.description).toBe('Original Description');
    expect(res.body.customer).toBeDefined();
    expect(res.body.customer.displayName).toBe(testCustomer.displayName);
  });

  it('GET /service-requests/:id returns 404 for non-existent ticket', async () => {
    const res = await request(app)
      .get('/service-requests/9999999')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(404);
  });

  it('PUT /service-requests/:id behaves as PATCH (only updates fields sent in body)', async () => {
    // Send update request with ONLY assignedTo
    const res = await request(app)
      .put(`/service-requests/${testTicket.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ assignedTo: 'Crew B' });

    expect(res.statusCode).toBe(200);
    expect(res.body.assignedTo).toBe('Crew B');

    // Retrieve from database to verify status and date are untouched
    const freshTicket = await prisma.serviceRequest.findUnique({
      where: { id: testTicket.id },
    });

    expect(freshTicket.status).toBe('SCHEDULED');
    expect(freshTicket.scheduledWorkDate.toISOString().split('T')[0]).toBe('2026-06-15');
    expect(freshTicket.description).toBe('Original Description');
  });

  describe('Crew ID Normalization Sync', () => {
    let testCrewA, testCrewB;

    beforeAll(async () => {
      testCrewA = await prisma.crew.findFirst({ where: { name: 'Test Crew A' } });
      if (!testCrewA) {
        testCrewA = await prisma.crew.create({
          data: { name: 'Test Crew A', color: '#ff0000', sortOrder: 97 }
        });
      }
      testCrewB = await prisma.crew.findFirst({ where: { name: 'Test Crew B' } });
      if (!testCrewB) {
        testCrewB = await prisma.crew.create({
          data: { name: 'Test Crew B', color: '#00ff00', sortOrder: 98 }
        });
      }
    });

    afterAll(async () => {
      if (testCrewA) {
        await prisma.crew.delete({ where: { id: testCrewA.id } }).catch(() => {});
      }
      if (testCrewB) {
        await prisma.crew.delete({ where: { id: testCrewB.id } }).catch(() => {});
      }
    });

    it('should set assignedTo when creating a ticket with assignedCrewId', async () => {
      const res = await request(app)
        .post('/service-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: testCustomer.id,
          description: 'Create with assignedCrewId',
          assignedCrewId: testCrewA.id,
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.assignedCrewId).toBe(testCrewA.id);
      expect(res.body.assignedTo).toBe('Test Crew A');

      // Cleanup
      await prisma.serviceRequest.delete({ where: { id: res.body.id } }).catch(() => {});
    });

    it('should set assignedCrewId when creating a ticket with assignedTo', async () => {
      const res = await request(app)
        .post('/service-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: testCustomer.id,
          description: 'Create with assignedTo name',
          assignedTo: 'Test Crew B',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.assignedCrewId).toBe(testCrewB.id);
      expect(res.body.assignedTo).toBe('Test Crew B');

      // Cleanup
      await prisma.serviceRequest.delete({ where: { id: res.body.id } }).catch(() => {});
    });

    it('should sync assignedTo when updating assignedCrewId', async () => {
      const res = await request(app)
        .put(`/service-requests/${testTicket.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ assignedCrewId: testCrewA.id });

      expect(res.statusCode).toBe(200);
      expect(res.body.assignedCrewId).toBe(testCrewA.id);
      expect(res.body.assignedTo).toBe('Test Crew A');
    });

    it('should sync assignedCrewId when updating assignedTo name', async () => {
      const res = await request(app)
        .put(`/service-requests/${testTicket.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ assignedTo: 'Test Crew B' });

      expect(res.statusCode).toBe(200);
      expect(res.body.assignedCrewId).toBe(testCrewB.id);
      expect(res.body.assignedTo).toBe('Test Crew B');
    });
  });
});

