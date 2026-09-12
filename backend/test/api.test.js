import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { signAccessToken } from '../src/middleware/auth.js';

process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-api-tests';
process.env.REDIS_URL = '';

const { default: app } = await import('../src/server.js');
const authToken = signAccessToken({ id: 'test-user', role: 'user' });

test('GET /api/health returns an API health response', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok', service: 'devflow-api' });
});

test('API responses include security headers', async () => {
  const response = await request(app).get('/api/health');

  assert.ok(response.headers['x-content-type-options']);
  assert.ok(response.headers['x-frame-options']);
});

test('protected endpoints reject requests without authentication', async () => {
  const response = await request(app).get('/api/workspaces');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Authentication required' });
});

test('protected endpoints reject invalid authentication tokens', async () => {
  const response = await request(app)
    .get('/api/workspaces')
    .set('Authorization', 'Bearer invalid-token');

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Invalid or expired access token' });
});

test('issue routes validate UUIDs before querying the database', async () => {
  const response = await request(app)
    .get('/api/projects/not-a-uuid/issues')
    .set('Authorization', `Bearer ${authToken}`);

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'Invalid project id' });
});

test('unknown API routes return a consistent 404 response', async () => {
  const response = await request(app).get('/api/does-not-exist');

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: 'Route not found' });
});
