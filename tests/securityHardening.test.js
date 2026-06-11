const request = require('supertest');
const app = require('../index');
const prisma = require('../prisma/client');
const path = require('path');
const fs = require('fs');

describe('Production Security Hardening', () => {
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

    // 2. Create customer and ticket for attachment testing
    testCustomer = await prisma.customer.findFirst();
    if (!testCustomer) {
      testCustomer = await prisma.customer.create({
        data: { displayName: 'Security Test Customer' },
      });
    }

    testTicket = await prisma.serviceRequest.create({
      data: {
        customerId: testCustomer.id,
        description: 'Security testing ticket',
        status: 'UNSCHEDULED',
      },
    });

    // Create a dummy file for upload testing
    fs.writeFileSync('test-attachment.exe', 'dummy exe content');
    fs.writeFileSync('test-image.png', 'dummy png content');
  });

  afterAll(async () => {
    if (testTicket) {
      await prisma.serviceRequest.delete({ where: { id: testTicket.id } }).catch(() => {});
    }
    // Cleanup dummy files
    if (fs.existsSync('test-attachment.exe')) fs.unlinkSync('test-attachment.exe');
    if (fs.existsSync('test-image.png')) fs.unlinkSync('test-image.png');
  });

  it('POST /import-jobs should reject non-CSV uploads (e.g. .png)', async () => {
    const res = await request(app)
      .post('/import-jobs')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', 'test-image.png');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Upload Error');
    expect(res.body.message).toBe('Only CSV files are allowed');
  });

  it('POST /service-requests/:id/attachments should reject forbidden file extensions (e.g. .exe)', async () => {
    const res = await request(app)
      .post(`/service-requests/${testTicket.id}/attachments`)
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', 'test-attachment.exe');

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Upload Error');
    expect(res.body.message).toBe('File extension is not allowed');
  });

  it('should block requests from unauthorized CORS origins', async () => {
    const res = await request(app)
      .get('/service-requests')
      .set('Origin', 'http://malicious-domain.com')
      .set('Authorization', `Bearer ${authToken}`);

    // Since CORS library throws an Error, it goes to error handler (500)
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Not allowed by CORS');
  });

  it('should allow requests from whitelisted CORS origins', async () => {
    const res = await request(app)
      .get('/service-requests')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toBe(200);
  });
});
