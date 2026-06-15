const request = require('supertest');
const app = require('../index');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { getSettings, saveSettings } = require('../utils/settings');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
const { JWT_SECRET } = require('../middleware/auth');

describe('Employees Settings API', () => {
  let adminToken, workerToken;
  let originalEmployees;

  beforeAll(() => {
    adminToken = jwt.sign({ userId: 9999, role: 'ADMIN' }, JWT_SECRET);
    workerToken = jwt.sign({ userId: 9998, role: 'WORKER' }, JWT_SECRET);

    // Save original employees to restore later
    const settings = getSettings();
    originalEmployees = settings.employees;
  });

  afterAll(() => {
    // Restore original employees
    const settings = getSettings();
    settings.employees = originalEmployees;
    saveSettings(settings);
  });

  describe('GET /settings/employees', () => {
    it('should block unauthenticated requests with 401', async () => {
      const res = await request(app).get('/settings/employees');
      expect(res.statusCode).toEqual(401);
    });

    it('should return employee list for authenticated user', async () => {
      const res = await request(app)
        .get('/settings/employees')
        .set('Authorization', `Bearer ${workerToken}`);
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /settings/employees/upload', () => {
    it('should block unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/settings/employees/upload')
        .attach('file', Buffer.from('iD,Name,Phone\n1,John Doe,555-1234'), 'employees.csv');
      expect(res.statusCode).toEqual(401);
    });

    it('should block worker role requests with 403', async () => {
      const res = await request(app)
        .post('/settings/employees/upload')
        .set('Authorization', `Bearer ${workerToken}`)
        .attach('file', Buffer.from('iD,Name,Phone\n1,John Doe,555-1234'), 'employees.csv');
      expect(res.statusCode).toEqual(403);
    });

    it('should successfully upload CSV and populate settings', async () => {
      const csvContent = 'iD,Name,Phone\nE101,John Doe,555-0101\nE102,Jane Smith,555-0102';
      const res = await request(app)
        .post('/settings/employees/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from(csvContent), 'employees.csv');

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.employees.length).toEqual(2);
      expect(res.body.employees[0]).toEqual({
        id: 'E101',
        name: 'John Doe',
        phone: '555-0101'
      });
      expect(res.body.employees[1]).toEqual({
        id: 'E102',
        name: 'Jane Smith',
        phone: '555-0102'
      });

      // Verify persistence via GET
      const getRes = await request(app)
        .get('/settings/employees')
        .set('Authorization', `Bearer ${workerToken}`);
      expect(getRes.statusCode).toEqual(200);
      expect(getRes.body.length).toEqual(2);
      expect(getRes.body[0].name).toEqual('John Doe');
    });

    it('should handle variations in CSV headers casing', async () => {
      const csvContent = 'ID,name,phone\nE103,Bob Johnson,555-0103';
      const res = await request(app)
        .post('/settings/employees/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from(csvContent), 'employees.csv');

      expect(res.statusCode).toEqual(200);
      expect(res.body.employees[0]).toEqual({
        id: 'E103',
        name: 'Bob Johnson',
        phone: '555-0103'
      });
    });
  });
});
