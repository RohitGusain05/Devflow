import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import request from 'supertest';
import { pool } from '../src/db.js';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-long-enough-for-integration-tests';
process.env.REDIS_URL = '';

const { default: app } = await import('../src/server.js');

const uniqueEmail = `integration-${Date.now()}@example.com`;
let token;
let userId;
let workspaceId;
let projectId;
let issueId;

before(async () => {
  await pool.query('SELECT 1');
});

test('registers a user and authenticates with the returned access token', async () => {
  const register = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Integration User', email: uniqueEmail, password: 'Password123!' });

  assert.equal(register.status, 201);
  assert.ok(register.body.user.id);
  assert.ok(register.body.accessToken);
  assert.equal(register.body.user.email, uniqueEmail);
  assert.equal(register.body.user.password_hash, undefined);

  userId = register.body.user.id;
  token = register.body.accessToken;

  const me = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, userId);
});

test('rejects invalid credentials', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email: uniqueEmail, password: 'wrong-password' });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: 'Invalid email or password' });
});

test('creates a workspace and automatically adds the owner as a member', async () => {
  const response = await request(app)
    .post('/api/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'DevFlow Integration Workspace' });

  assert.equal(response.status, 201);
  workspaceId = response.body.workspace.id;
  assert.equal(response.body.workspace.owner_id, userId);

  const list = await request(app)
    .get('/api/workspaces')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(list.status, 200);
  assert.equal(list.body.workspaces[0].id, workspaceId);
  assert.equal(list.body.workspaces[0].role, 'owner');
});

test('creates a project and issue with sequential issue numbering', async () => {
  const project = await request(app)
    .post(`/api/workspaces/${workspaceId}/projects`)
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Core API', key: 'API', description: 'Integration test project' });

  assert.equal(project.status, 201);
  projectId = project.body.project.id;
  assert.equal(project.body.project.key, 'API');

  const issue = await request(app)
    .post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Harden API integration flow', priority: 'high' });

  assert.equal(issue.status, 201);
  issueId = issue.body.issue.id;
  assert.equal(issue.body.issue.issue_number, 1);
  assert.equal(issue.body.issue.priority, 'high');

  const second = await request(app)
    .post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Add another issue' });

  assert.equal(second.status, 201);
  assert.equal(second.body.issue.issue_number, 2);
});

test('lists, updates, and comments on an issue', async () => {
  const list = await request(app)
    .get(`/api/projects/${projectId}/issues?status=todo&page=1&limit=10`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(list.status, 200);
  assert.equal(list.body.issues.length, 2);
  assert.equal(list.body.pagination.page, 1);

  const update = await request(app)
    .patch(`/api/issues/${issueId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'in_progress', assigneeId: userId });

  assert.equal(update.status, 200);
  assert.equal(update.body.issue.status, 'in_progress');
  assert.equal(update.body.issue.assignee_id, userId);

  const comment = await request(app)
    .post(`/api/issues/${issueId}/comments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ body: 'Integration test comment' });

  assert.equal(comment.status, 201);
  assert.equal(comment.body.comment.body, 'Integration test comment');

  const comments = await request(app)
    .get(`/api/issues/${issueId}/comments`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(comments.status, 200);
  assert.equal(comments.body.comments.length, 1);
  assert.equal(comments.body.comments[0].author_id, userId);
});

after(async () => {
  if (workspaceId) await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  await pool.end();
});
