const request = require('supertest');
const app = require('../index');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');
// Test safety: provide a test secret so we don't rely on (now-removed) insecure default in auth.js
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
const { JWT_SECRET } = require('../middleware/auth');

describe('Settings Reorder API', () => {
  let adminToken, workerToken;
  let testCrews = [];
  let testCategories = [];

  beforeAll(async () => {
    adminToken = jwt.sign({ userId: 9999, role: 'ADMIN' }, JWT_SECRET);
    workerToken = jwt.sign({ userId: 9998, role: 'WORKER' }, JWT_SECRET);

    // Create test crews
    testCrews.push(await prisma.crew.create({ data: { name: 'Reorder Crew A', color: '#111111', sortOrder: 1 } }));
    testCrews.push(await prisma.crew.create({ data: { name: 'Reorder Crew B', color: '#222222', sortOrder: 2 } }));
    testCrews.push(await prisma.crew.create({ data: { name: 'Reorder Crew C', color: '#333333', sortOrder: 3 } }));

    // Create test categories
    testCategories.push(await prisma.jobCategory.create({ data: { name: 'Reorder Category A', icon: '🚜', sortOrder: 1 } }));
    testCategories.push(await prisma.jobCategory.create({ data: { name: 'Reorder Category B', icon: '❄️', sortOrder: 2 } }));
    testCategories.push(await prisma.jobCategory.create({ data: { name: 'Reorder Category C', icon: '🧱', sortOrder: 3 } }));
  });

  afterAll(async () => {
    // Delete test crews
    await prisma.crew.deleteMany({
      where: { id: { in: testCrews.map(c => c.id) } }
    });
    // Delete test categories
    await prisma.jobCategory.deleteMany({
      where: { id: { in: testCategories.map(c => c.id) } }
    });
    await prisma.$disconnect();
  });

  describe('Crews Reordering', () => {
    it('should block unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/settings/crews/reorder')
        .send({ ids: testCrews.map(c => c.id) });
      expect(res.statusCode).toEqual(401);
    });

    it('should block worker role requests with 403', async () => {
      const res = await request(app)
        .post('/settings/crews/reorder')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ ids: testCrews.map(c => c.id) });
      expect(res.statusCode).toEqual(403);
    });

    it('should validate request body IDs using Zod', async () => {
      const res = await request(app)
        .post('/settings/crews/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: ['invalid', 2] });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('Validation Error');
    });

    it('should reorder crews successfully and return ordered list', async () => {
      // Reorder: C (index 0), A (index 1), B (index 2)
      const newOrderIds = [testCrews[2].id, testCrews[0].id, testCrews[1].id];
      const res = await request(app)
        .post('/settings/crews/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: newOrderIds });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      // Verify the list retrieves in the new sort order
      const getRes = await request(app)
        .get('/settings/crews')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(getRes.statusCode).toEqual(200);
      const returnedCrews = getRes.body.filter(c => testCrews.map(tc => tc.id).includes(c.id));
      expect(returnedCrews[0].id).toEqual(testCrews[2].id);
      expect(returnedCrews[1].id).toEqual(testCrews[0].id);
      expect(returnedCrews[2].id).toEqual(testCrews[1].id);
    });
  });

  describe('Job Categories Reordering', () => {
    it('should block unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/settings/job-categories/reorder')
        .send({ ids: testCategories.map(c => c.id) });
      expect(res.statusCode).toEqual(401);
    });

    it('should block worker role requests with 403', async () => {
      const res = await request(app)
        .post('/settings/job-categories/reorder')
        .set('Authorization', `Bearer ${workerToken}`)
        .send({ ids: testCategories.map(c => c.id) });
      expect(res.statusCode).toEqual(403);
    });

    it('should validate request body IDs using Zod', async () => {
      const res = await request(app)
        .post('/settings/job-categories/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: ['invalid', 2] });
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('Validation Error');
    });

    it('should reorder job categories successfully and return ordered list', async () => {
      // Reorder: C (index 0), B (index 1), A (index 2)
      const newOrderIds = [testCategories[2].id, testCategories[1].id, testCategories[0].id];
      const res = await request(app)
        .post('/settings/job-categories/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ids: newOrderIds });
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      // Verify the list retrieves in the new sort order
      const getRes = await request(app)
        .get('/settings/job-categories')
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(getRes.statusCode).toEqual(200);
      const returnedCats = getRes.body.filter(c => testCategories.map(tc => tc.id).includes(c.id));
      expect(returnedCats[0].id).toEqual(testCategories[2].id);
      expect(returnedCats[1].id).toEqual(testCategories[1].id);
      expect(returnedCats[2].id).toEqual(testCategories[0].id);
    });
  });
});
