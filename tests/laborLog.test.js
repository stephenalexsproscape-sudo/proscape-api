const request = require('supertest');
const app = require('../index');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Use JWT Secret from environment or fallback
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
const { JWT_SECRET } = require('../middleware/auth');

describe('Labor State Machine & Tracking API', () => {
  let crewA, crewB;
  let workerUserA, workerUserB;
  let workerTokenA, workerTokenB;
  let ticket;
  let customer;

  beforeAll(async () => {
    // 1. Create test crews
    crewA = await prisma.crew.create({
      data: { name: 'Labor Test Crew A', color: '#00ff00' }
    });
    crewB = await prisma.crew.create({
      data: { name: 'Labor Test Crew B', color: '#ff0000' }
    });

    // 2. Create test users
    const hashedPassword = await bcrypt.hash('labor_pass', 10);
    workerUserA = await prisma.user.create({
      data: {
        username: 'labor_worker_a',
        passwordHash: hashedPassword,
        role: 'WORKER',
        crewId: crewA.id
      }
    });
    workerUserB = await prisma.user.create({
      data: {
        username: 'labor_worker_b',
        passwordHash: hashedPassword,
        role: 'WORKER',
        crewId: crewB.id
      }
    });

    // Generate tokens
    workerTokenA = jwt.sign({ userId: workerUserA.id, role: 'WORKER' }, JWT_SECRET);
    workerTokenB = jwt.sign({ userId: workerUserB.id, role: 'WORKER' }, JWT_SECRET);

    // 3. Create test customer and ticket
    customer = await prisma.customer.create({
      data: { displayName: 'Labor Test Client' }
    });

    ticket = await prisma.serviceRequest.create({
      data: {
        customerId: customer.id,
        description: 'Labor Clocking Test Ticket',
        assignedCrewId: crewA.id,
        status: 'SCHEDULED'
      }
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.laborLog.deleteMany({ where: { serviceRequestId: ticket.id } });
    await prisma.serviceRequest.delete({ where: { id: ticket.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.user.deleteMany({ where: { id: { in: [workerUserA.id, workerUserB.id] } } });
    await prisma.crew.deleteMany({ where: { id: { in: [crewA.id, crewB.id] } } });
    await prisma.$disconnect();
  });

  it('should deny labor status updates if worker is on a different crew', async () => {
    const res = await request(app)
      .patch(`/service-requests/${ticket.id}/labor-status`)
      .set('Authorization', `Bearer ${workerTokenB}`)
      .send({ laborState: 'EN_ROUTE' });

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toContain("You are not assigned to this job's crew");
  });

  it('should successfully transition to EN_ROUTE and create an open LaborLog', async () => {
    const res = await request(app)
      .patch(`/service-requests/${ticket.id}/labor-status`)
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({ laborState: 'EN_ROUTE' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.laborState).toEqual('EN_ROUTE');

    // Verify open LaborLog exists
    const openLog = await prisma.laborLog.findFirst({
      where: {
        serviceRequestId: ticket.id,
        workerId: workerUserA.id,
        endedAt: null
      }
    });
    expect(openLog).toBeDefined();
    expect(openLog.status).toEqual('EN_ROUTE');
  });

  it('should deny invalid transitions (e.g. EN_ROUTE back to COMPLETED directly)', async () => {
    const res = await request(app)
      .patch(`/service-requests/${ticket.id}/labor-status`)
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({ laborState: 'COMPLETED' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('Invalid transition');
  });

  it('should transition EN_ROUTE -> IN_PROGRESS, closing travel log and starting labor log', async () => {
    const res = await request(app)
      .patch(`/service-requests/${ticket.id}/labor-status`)
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({ laborState: 'IN_PROGRESS' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.laborState).toEqual('IN_PROGRESS');

    // Travel log should be closed
    const travelLog = await prisma.laborLog.findFirst({
      where: {
        serviceRequestId: ticket.id,
        workerId: workerUserA.id,
        status: 'EN_ROUTE'
      }
    });
    expect(travelLog.endedAt).not.toBeNull();
    expect(travelLog.durationMinutes).toBeDefined();

    // New active labor log should exist
    const laborLog = await prisma.laborLog.findFirst({
      where: {
        serviceRequestId: ticket.id,
        workerId: workerUserA.id,
        status: 'IN_PROGRESS',
        endedAt: null
      }
    });
    expect(laborLog).toBeDefined();
  });

  it('should transition IN_PROGRESS -> COMPLETED, closing log and marking ticket DONE', async () => {
    const res = await request(app)
      .patch(`/service-requests/${ticket.id}/labor-status`)
      .set('Authorization', `Bearer ${workerTokenA}`)
      .send({ laborState: 'COMPLETED', note: 'Mowed lawn and blew clippings' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.laborState).toEqual('IDLE'); // reset
    expect(res.body.status).toEqual('DONE'); // completed

    // On-site labor log should be closed
    const laborLog = await prisma.laborLog.findFirst({
      where: {
        serviceRequestId: ticket.id,
        workerId: workerUserA.id,
        status: 'IN_PROGRESS'
      }
    });
    expect(laborLog.endedAt).not.toBeNull();
    expect(laborLog.durationMinutes).toBeDefined();

    // Check message exists
    const message = await prisma.message.findFirst({
      where: { customerId: customer.id }
    });
    expect(message).toBeDefined();
    expect(message.content).toContain('LABOR COMPLETE');
  });
});
