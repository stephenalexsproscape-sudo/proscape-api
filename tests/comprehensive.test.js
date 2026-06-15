const request = require('supertest');
const app = require('../index');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

describe('Proscape Total System Audit', () => {
  let adminToken, managerToken, workerToken;
  let testAdmin, testManager, testWorker;
  let testCustomer, testTicket;

  beforeAll(async () => {
    // 1. Setup Test Users
    testAdmin = await prisma.user.upsert({
      where: { username: 'audit_admin' },
      update: {},
      create: { username: 'audit_admin', passwordHash: 'hash', role: 'ADMIN', email: 'audit_admin@example.com' }
    });
    testManager = await prisma.user.upsert({
      where: { username: 'audit_manager' },
      update: {},
      create: { username: 'audit_manager', passwordHash: 'hash', role: 'MANAGER', email: 'audit_manager@example.com' }
    });
    testWorker = await prisma.user.upsert({
      where: { username: 'audit_worker' },
      update: {},
      create: { username: 'audit_worker', passwordHash: 'hash', role: 'WORKER', email: 'audit_worker@example.com' }
    });

    // 2. Generate Tokens (Simulate login by directly signing or using the /login endpoint if it allows 'hash')
    // We'll use a hacky way since /login expects real passwords, but for testing RBAC we just need valid signed tokens.
    const jwt = require('jsonwebtoken');
    // Test safety: provide a test secret so we don't rely on (now-removed) insecure default in auth.js
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
    const { JWT_SECRET } = require('../middleware/auth');
    adminToken = jwt.sign({ userId: testAdmin.id, role: 'ADMIN' }, JWT_SECRET);
    managerToken = jwt.sign({ userId: testManager.id, role: 'MANAGER' }, JWT_SECRET);
    workerToken = jwt.sign({ userId: testWorker.id, role: 'WORKER' }, JWT_SECRET);

    // 3. Setup Test Data
    testCustomer = await prisma.customer.create({
        data: { displayName: 'AUDIT TEST CUSTOMER' }
    });
    testTicket = await prisma.serviceRequest.create({
        data: {
          customerId: testCustomer.id,
          description: 'Audit test ticket',
          status: 'UNSCHEDULED'
        }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.serviceRequest.deleteMany({ where: { customerId: testCustomer.id } });
    await prisma.customer.delete({ where: { id: testCustomer.id } });
    await prisma.user.deleteMany({ where: { username: { in: ['audit_admin', 'audit_manager', 'audit_worker'] } } });
    await prisma.$disconnect();
  });

  describe('Pillar 1: RBAC Enforcement', () => {
    it('WORKER should be blocked from Admin Audit Logs (403)', async () => {
      const res = await request(app)
        .get('/admin/audit-log')
        .set('Authorization', `Bearer ${workerToken}`);
      expect(res.statusCode).toEqual(403);
    });

    it('MANAGER should be blocked from Admin Audit Logs (403)', async () => {
      const res = await request(app)
        .get('/admin/audit-log')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toEqual(403);
    });

    it('ADMIN should access Admin Audit Logs (200)', async () => {
      const res = await request(app)
        .get('/admin/audit-log')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('WORKER should be blocked from uploading GENERAL attachments (403)', async () => {
      const fs = require('fs');
      fs.writeFileSync('test-worker-upload.txt', 'worker file content');
      
      const res = await request(app)
        .post(`/service-requests/${testTicket.id}/attachments`)
        .set('Authorization', `Bearer ${workerToken}`)
        .attach('file', 'test-worker-upload.txt')
        .field('type', 'GENERAL')
        .field('caption', 'Worker tried general upload');
        
      if (fs.existsSync('test-worker-upload.txt')) fs.unlinkSync('test-worker-upload.txt');
      
      expect(res.statusCode).toEqual(403);
      expect(res.body.error).toContain('before/after photos');
    });

    it('WORKER should be allowed to upload BEFORE_PHOTO or AFTER_PHOTO attachments (200)', async () => {
      const fs = require('fs');
      fs.writeFileSync('test-worker-photo.png', 'worker photo content');
      
      const res = await request(app)
        .post(`/service-requests/${testTicket.id}/attachments`)
        .set('Authorization', `Bearer ${workerToken}`)
        .attach('file', 'test-worker-photo.png')
        .field('type', 'BEFORE_PHOTO')
        .field('caption', 'Before photo upload');
        
      if (fs.existsSync('test-worker-photo.png')) fs.unlinkSync('test-worker-photo.png');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.type).toEqual('BEFORE_PHOTO');
    });

    it('ADMIN/MANAGER should be allowed to upload GENERAL attachments (200)', async () => {
      const fs = require('fs');
      fs.writeFileSync('test-admin-doc.pdf', 'admin doc content');
      
      const res = await request(app)
        .post(`/service-requests/${testTicket.id}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', 'test-admin-doc.pdf')
        .field('type', 'GENERAL')
        .field('caption', 'Admin doc upload');
        
      if (fs.existsSync('test-admin-doc.pdf')) fs.unlinkSync('test-admin-doc.pdf');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.type).toEqual('GENERAL');
    });
  });

  describe('Pillar 2: Scheduling & Recurring Logic', () => {
    it('Should generate 3 weekly tickets correctly', async () => {
      const res = await request(app)
        .post('/service-requests')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          customerId: testCustomer.id,
          description: 'Recurring Test',
          requestType: 'Mowing',
          repeatCount: 3,
          repeatType: 'weekly',
          scheduledWorkDate: '2026-07-01'
        });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.length).toEqual(3);
      // Check date math (+7 days)
      const date1 = new Date(res.body[0].scheduledWorkDate).toISOString().split('T')[0];
      const date2 = new Date(res.body[1].scheduledWorkDate).toISOString().split('T')[0];
      expect(date1).toEqual('2026-07-01');
      expect(date2).toEqual('2026-07-08');
    });
  });

  describe('Pillar 3: Data Integrity & Validation', () => {
    it('Should reject job creation with missing description (400)', async () => {
      const res = await request(app)
        .post('/service-requests')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ customerId: testCustomer.id }); // No description
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('Validation Error');
    });

    it('Should reject malformed date in update (400)', async () => {
      const res = await request(app)
        .put('/service-requests/1')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ scheduledWorkDate: 'NOT-A-DATE' });
      
      expect(res.statusCode).toEqual(400);
    });
  });

  describe('Pillar 4: Batch Utilities', () => {
    it('ADMIN should trigger job export (200)', async () => {
      const res = await request(app)
        .post('/export-jobs')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    }, 30000);

    it('Should process bulk manual entry atomically', async () => {
      const payload = [
        { customerId: testCustomer.id, description: 'Bulk 1', requestType: 'Mowing' },
        { customerId: testCustomer.id, description: 'Bulk 2', requestType: 'Lawn Care' }
      ];
      const res = await request(app)
        .post('/service-requests/bulk-manual')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(payload);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.count).toEqual(2);
    });
  });

  describe('Pillar 5: Internal Messaging', () => {
    it('Should send internal message and appear in receiver inbox', async () => {
      // Admin to Worker
      const sendRes = await request(app)
        .post('/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          receiverId: testWorker.id,
          content: 'Audit Message'
        });
      
      expect(sendRes.statusCode).toEqual(200);

      // Check Worker Inbox
      const inboxRes = await request(app)
        .get('/messages/inbox')
        .set('Authorization', `Bearer ${workerToken}`);
      
      expect(inboxRes.statusCode).toEqual(200);
      const msg = inboxRes.body.find(m => m.content === 'Audit Message');
      expect(msg).toBeDefined();
      expect(msg.sender.username).toEqual('audit_admin');
    });
  });
});
