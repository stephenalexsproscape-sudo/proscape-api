const request = require('supertest');
const app = require('../index');

describe('Calendar Notes API', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: 'admin', password: '55255525' });
    
    if (res.statusCode === 200) {
      authToken = res.body.token;
    }
  });

  describe('Calendar Note CRUD', () => {
    let noteId;

    it('POST /calendar-notes should create a calendar note', async () => {
      const res = await request(app)
        .post('/calendar-notes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Delivery Note',
          noteType: 'DELIVERY',
          startDate: '2026-06-15',
          endDate: '2026-06-16',
          description: 'Deliver mulch to site'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.title).toEqual('Test Delivery Note');
      expect(res.body.noteType).toEqual('DELIVERY');
      noteId = res.body.id;
    });

    it('GET /calendar-notes should return notes list', async () => {
      const res = await request(app)
        .get('/calendar-notes')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find(n => n.id === noteId);
      expect(found).toBeDefined();
    });

    it('PUT /calendar-notes/:id should update calendar note', async () => {
      const res = await request(app)
        .put(`/calendar-notes/${noteId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Test Note',
          description: 'Deliver mulch and gravel'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.title).toEqual('Updated Test Note');
      expect(res.body.description).toEqual('Deliver mulch and gravel');
    });

    it('DELETE /calendar-notes/:id should delete the note', async () => {
      const res = await request(app)
        .delete(`/calendar-notes/${noteId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });
});
