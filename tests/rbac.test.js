const request = require('supertest');
const app = require('../index');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

describe('RBAC Matrix Enforcement', () => {
  let adminToken, managerToken, workerToken;
  let adminUser, managerUser, workerUser;
  let testCustomer;

  beforeAll(async () => {
    // Setup users with different roles
    const hashedPassword = await bcrypt.hash('matrix_pass', 10);
    adminUser = await prisma.user.upsert({
      where: { username: 'matrix_admin' },
      update: { passwordHash: hashedPassword },
      create: { username: 'matrix_admin', passwordHash: hashedPassword, role: 'ADMIN', email: 'admin@matrix.com' }
    });
    managerUser = await prisma.user.upsert({
      where: { username: 'matrix_manager' },
      update: { passwordHash: hashedPassword },
      create: { username: 'matrix_manager', passwordHash: hashedPassword, role: 'MANAGER', email: 'manager@matrix.com' }
    });
    workerUser = await prisma.user.upsert({
      where: { username: 'matrix_worker' },
      update: { passwordHash: hashedPassword },
      create: { username: 'matrix_worker', passwordHash: hashedPassword, role: 'WORKER', email: 'worker@matrix.com' }
    });

    adminToken = jwt.sign({ userId: adminUser.id, role: 'ADMIN' }, JWT_SECRET);
    managerToken = jwt.sign({ userId: managerUser.id, role: 'MANAGER' }, JWT_SECRET);
    workerToken = jwt.sign({ userId: workerUser.id, role: 'WORKER' }, JWT_SECRET);

    testCustomer = await prisma.customer.create({
      data: { displayName: 'MATRIX TEST CUSTOMER' }
    });
  });

  afterAll(async () => {
    await prisma.serviceRequest.deleteMany({ where: { customerId: testCustomer.id } });
    await prisma.customer.delete({ where: { id: testCustomer.id } });
    await prisma.user.deleteMany({ where: { username: { in: ['matrix_admin', 'matrix_manager', 'matrix_worker'] } } });
    await prisma.$disconnect();
  });

  const testMatrix = [
    // [Method, Path, AdminCode, ManagerCode, WorkerCode]
    ['GET', '/admin/audit-log', 200, 403, 403],
    ['GET', '/settings/staff', 200, 200, 200],
    ['POST', '/settings/crews', 200, 200, 403],
    ['POST', '/service-requests', 200, 200, 403], // Workers blocked from creating tickets
    ['GET', '/analytics/performance', 200, 200, 403], // Workers blocked from analytics
    ['POST', '/export-jobs', 200, 403, 403],
    ['POST', '/login', 200, 200, 200],
  ];

  testMatrix.forEach(([method, path, adminCode, managerCode, workerCode]) => {
    describe(`${method} ${path}`, () => {
      const getPayload = () => {
        if (path === '/login') return { username: 'matrix_admin', password: 'matrix_pass' };
        if (path === '/settings/crews') return { name: 'Matrix Crew ' + Math.random(), color: '#ff0000' };
        if (path === '/service-requests') return { customerId: testCustomer.id, description: 'Matrix Ticket', requestType: 'Mowing' };
        return {};
      };

      it(`ADMIN should get ${adminCode}`, async () => {
        let res;
        if (method === 'GET') res = await request(app).get(path).set('Authorization', `Bearer ${adminToken}`);
        if (method === 'POST') res = await request(app).post(path).set('Authorization', `Bearer ${adminToken}`).send(getPayload());
        expect(res.statusCode).toEqual(adminCode);
      }, 30000);

      it(`MANAGER should get ${managerCode}`, async () => {
        let res;
        if (method === 'GET') res = await request(app).get(path).set('Authorization', `Bearer ${managerToken}`);
        if (method === 'POST') res = await request(app).post(path).set('Authorization', `Bearer ${managerToken}`).send(getPayload());
        expect(res.statusCode).toEqual(managerCode);
      }, 30000);

      it(`WORKER should get ${workerCode}`, async () => {
        let res;
        if (method === 'GET') res = await request(app).get(path).set('Authorization', `Bearer ${workerToken}`);
        if (method === 'POST') res = await request(app).post(path).set('Authorization', `Bearer ${workerToken}`).send(getPayload());
        expect(res.statusCode).toEqual(workerCode);
      }, 30000);

      it(`UNAUTHENTICATED should get 401 (if not /login)`, async () => {
        if (path === '/login') return;
        let res;
        if (method === 'GET') res = await request(app).get(path);
        if (method === 'POST') res = await request(app).post(path);
        expect(res.statusCode).toEqual(401);
      }, 30000);
    });
  });
});
