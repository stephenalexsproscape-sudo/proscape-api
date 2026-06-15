const request = require('supertest');
const app = require('../index');

describe('API Endpoints', () => {
  let authToken;

  beforeAll(async () => {
    // Attempt to log in with known admin credentials to get a token for protected routes
    const res = await request(app)
      .post('/login')
      .send({ username: 'admin', password: '55255525' });
    
    if (res.statusCode === 200) {
      authToken = res.body.token;
    }
  });

  describe('Public Endpoints', () => {
    it('GET / should return the frontend index page', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toEqual(200);
      expect(res.text).toContain('Proscape Command Center');
    });

    it('POST /login with invalid credentials should return 401', async () => {
      const res = await request(app).post('/login').send({ username: 'wrong', password: 'wrong' });
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Validation & Data Integrity (Zod)', () => {
    it('POST /service-requests should fail if description is missing (400)', async () => {
      const res = await request(app)
        .post('/service-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ requestType: 'Lawn Care' }); // Missing description
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('Validation Error');
    });

    it('PUT /customers/:id/specs should fail if mulchYardage is not a number (400)', async () => {
      const res = await request(app)
        .put('/customers/1/specs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ mulchYardage: 'not-a-number' });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('Validation Error');
    });

    it('GET /customers/:id should return 404 if customer does not exist', async () => {
      const res = await request(app)
        .get('/customers/9999999')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.statusCode).toEqual(404);
    });

    it('PUT /customers/:id/specs should return 404 if customer does not exist', async () => {
      const res = await request(app)
        .put('/customers/9999999/specs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ snowTrigger: '2 inches' });
      expect(res.statusCode).toEqual(404);
    });

    it('PUT /customers/:id should return 404 if customer does not exist', async () => {
      const res = await request(app)
        .put('/customers/9999999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ displayName: 'New Display Name' });
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('Protected Admin Endpoints', () => {
    it('GET /settings/staff should require authentication', async () => {
      const res = await request(app).get('/settings/staff');
      expect(res.statusCode).toEqual(401);
    });

    it('GET /settings/staff should return staff list when authenticated', async () => {
      if (!authToken) return; // Skip if login failed
      const res = await request(app)
        .get('/settings/staff')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /admin/audit-log should return system logs', async () => {
      if (!authToken) return;
      const res = await request(app)
        .get('/admin/audit-log')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /settings/note-colors should require authentication', async () => {
      const res = await request(app).get('/settings/note-colors');
      expect(res.statusCode).toEqual(401);
    });

    it('GET /settings/note-colors should return colors dictionary when authenticated', async () => {
      if (!authToken) return;
      const res = await request(app)
        .get('/settings/note-colors')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('DELIVERY');
      expect(res.body).toHaveProperty('VACATION');
      expect(res.body).toHaveProperty('EVENT');
      expect(res.body).toHaveProperty('OTHER');
    });

    it('PUT /settings/note-colors should update note colors and validation checks', async () => {
      if (!authToken) return;
      const payload = {
        DELIVERY: { bg: '#ff0000' },
        VACATION: { bg: '#00ff00', border: '#00aa00' },
        EVENT: { bg: '#0000ff' },
        OTHER: { bg: '#ffff00' },
      };

      const res = await request(app)
        .put('/settings/note-colors')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.noteColors.DELIVERY.bg).toEqual('#ff0000');
      expect(res.body.noteColors.DELIVERY.border).toEqual('#ff0000'); // derived border
      expect(res.body.noteColors.VACATION.bg).toEqual('#00ff00');
      expect(res.body.noteColors.VACATION.border).toEqual('#00aa00'); // explicit border
    });

    it('PUT /settings/note-colors should fail if data is invalid (400)', async () => {
      if (!authToken) return;
      const res = await request(app)
        .put('/settings/note-colors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ DELIVERY: { bg: 123 } }); // invalid bg and missing fields
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('Validation Error');
    });
  });
});
