import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { requireAuth, signAccessToken } from '../src/middleware/auth.js';

process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-unit-tests';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';

test('signAccessToken creates a verifiable access token with the user id', () => {
  const token = signAccessToken({ id: 'user-123' });
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

  assert.equal(payload.sub, 'user-123');
  assert.equal(payload.role, 'user');
});

test('requireAuth rejects a missing bearer token', () => {
  const req = {
    get: () => undefined,
  };
  const response = createResponse();
  let nextCalled = false;

  requireAuth(req, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required' });
  assert.equal(nextCalled, false);
});

test('requireAuth rejects an invalid token', () => {
  const req = {
    get: () => 'Bearer invalid-token',
  };
  const response = createResponse();
  let nextCalled = false;

  requireAuth(req, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Invalid or expired access token' });
  assert.equal(nextCalled, false);
});

test('requireAuth attaches claims for a valid bearer token', () => {
  const token = signAccessToken({ id: 'user-456', role: 'admin' });
  const req = {
    get: (name) => name === 'authorization' ? `Bearer ${token}` : undefined,
  };
  const response = createResponse();
  let nextCalled = false;

  requireAuth(req, response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.auth.sub, 'user-456');
  assert.equal(req.auth.role, 'admin');
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}
