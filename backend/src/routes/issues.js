import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { emitProjectEvent } from '../realtime.js';
import { io } from '../server.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const createSchema = z.object({
  title: z.string().trim().min(3).max(240),
  description: z.string().trim().max(10000).optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assigneeId: uuid.optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().trim().min(3).max(240).optional(),
  description: z.string().trim().max(10000).optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assigneeId: uuid.optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
}).refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

async function projectAccess(projectId, userId) {
  const result = await query(
    `SELECT p.id, p.workspace_id, p.key
     FROM projects p
     JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
     WHERE p.id = $1 AND wm.user_id = $2`,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}

async function userIsMember(workspaceId, userId) {
  const result = await query(
    `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );
  return Boolean(result.rows[0]);
}

router.post('/projects/:projectId/issues', async (req, res, next) => {
  const projectId = uuid.safeParse(req.params.projectId);
  const body = createSchema.safeParse(req.body);
  if (!projectId.success || !body.success) return res.status(400).json({ error: 'Invalid issue data' });

  try {
    const project = await projectAccess(projectId.data, req.auth.sub);
    if (!project) return res.status(403).json({ error: 'Project access denied' });

    if (body.data.assigneeId && !(await userIsMember(project.workspace_id, body.data.assigneeId))) {
      return res.status(400).json({ error: 'Assignee must belong to the project workspace' });
    }

    const issue = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [project.id]);
      const next = await client.query(
        `SELECT COALESCE(MAX(issue_number), 0) + 1 AS issue_number FROM issues WHERE project_id = $1`,
        [project.id],
      );
      const result = await client.query(
        `INSERT INTO issues
          (project_id, issue_number, title, description, priority, reporter_id, assignee_id, due_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, project_id, issue_number, title, description, status, priority,
                   reporter_id, assignee_id, due_at, created_at, updated_at`,
        [project.id, next.rows[0].issue_number, body.data.title, body.data.description ?? null,
          body.data.priority, req.auth.sub, body.data.assigneeId ?? null, body.data.dueAt ?? null],
      );
      const created = result.rows[0];
      await client.query(
        `INSERT INTO issue_activity (issue_id, actor_id, action, metadata)
         VALUES ($1, $2, 'issue_created', jsonb_build_object('issueNumber', $3::int))`,
        [created.id, req.auth.sub, created.issue_number],
      );
      return created;
    });

    emitProjectEvent(io, project.id, 'issue:created', { issue });
    return res.status(201).json({ issue });
  } catch (error) {
    return next(error);
  }
});

router.get('/projects/:projectId/issues', async (req, res, next) => {
  const projectId = uuid.safeParse(req.params.projectId);
  const page = Math.max(Number.parseInt(req.query.page ?? '1', 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '20', 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const status = req.query.status;
  const priority = req.query.priority;

  if (!projectId.success) return res.status(400).json({ error: 'Invalid project id' });
  if (status && !['todo', 'in_progress', 'in_review', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (priority && !['low', 'medium', 'high', 'critical'].includes(priority)) return res.status(400).json({ error: 'Invalid priority' });

  try {
    const project = await projectAccess(projectId.data, req.auth.sub);
    if (!project) return res.status(403).json({ error: 'Project access denied' });

    const params = [projectId.data];
    const filters = ['i.project_id = $1'];
    if (status) { params.push(status); filters.push(`i.status = $${params.length}`); }
    if (priority) { params.push(priority); filters.push(`i.priority = $${params.length}`); }

    const count = await query(`SELECT COUNT(*)::int AS total FROM issues i WHERE ${filters.join(' AND ')}`, params);
    params.push(limit, offset);
    const result = await query(
      `SELECT i.id, i.issue_number, i.title, i.description, i.status, i.priority,
              i.reporter_id, reporter.name AS reporter_name,
              i.assignee_id, assignee.name AS assignee_name,
              i.due_at, i.created_at, i.updated_at
       FROM issues i
       JOIN users reporter ON reporter.id = i.reporter_id
       LEFT JOIN users assignee ON assignee.id = i.assignee_id
       WHERE ${filters.join(' AND ')}
       ORDER BY i.issue_number DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return res.json({ issues: result.rows, pagination: { page, limit, total: count.rows[0].total, pages: Math.ceil(count.rows[0].total / limit) } });
  } catch (error) {
    return next(error);
  }
});

router.get('/issues/:issueId', async (req, res, next) => {
  const issueId = uuid.safeParse(req.params.issueId);
  if (!issueId.success) return res.status(400).json({ error: 'Invalid issue id' });

  try {
    const result = await query(
      `SELECT i.*, p.name AS project_name, p.key AS project_key, p.workspace_id,
              reporter.name AS reporter_name, assignee.name AS assignee_name
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       JOIN users reporter ON reporter.id = i.reporter_id
       LEFT JOIN users assignee ON assignee.id = i.assignee_id
       WHERE i.id = $1`,
      [issueId.data, req.auth.sub],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Issue not found' });
    return res.json({ issue: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/issues/:issueId', async (req, res, next) => {
  const issueId = uuid.safeParse(req.params.issueId);
  const body = updateSchema.safeParse(req.body);
  if (!issueId.success || !body.success) return res.status(400).json({ error: 'Invalid issue update' });

  try {
    const existing = await query(
      `SELECT i.id, i.project_id, p.workspace_id
       FROM issues i JOIN projects p ON p.id = i.project_id
       JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.user_id = $2
       WHERE i.id = $1`,
      [issueId.data, req.auth.sub],
    );
    const current = existing.rows[0];
    if (!current) return res.status(404).json({ error: 'Issue not found' });

    if (body.data.assigneeId && !(await userIsMember(current.workspace_id, body.data.assigneeId))) {
      return res.status(400).json({ error: 'Assignee must belong to the project workspace' });
    }

    const fields = [];
    const params = [];
    const changes = {};
    const add = (column, value, metadataKey = column) => {
      params.push(value);
      fields.push(`${column} = $${params.length}`);
      changes[metadataKey] = value;
    };
    if (body.data.title !== undefined) add('title', body.data.title);
    if (body.data.description !== undefined) add('description', body.data.description);
    if (body.data.status !== undefined) add('status', body.data.status);
    if (body.data.priority !== undefined) add('priority', body.data.priority);
    if (body.data.assigneeId !== undefined) add('assignee_id', body.data.assigneeId, 'assigneeId');
    if (body.data.dueAt !== undefined) add('due_at', body.data.dueAt, 'dueAt');
    fields.push('updated_at = NOW()');
    params.push(issueId.data);

    const issue = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE issues SET ${fields.join(', ')} WHERE id = $${params.length}
         RETURNING id, project_id, issue_number, title, description, status, priority,
                   reporter_id, assignee_id, due_at, created_at, updated_at`,
        params,
      );
      const updated = result.rows[0];
      await client.query(
        `INSERT INTO issue_activity (issue_id, actor_id, action, metadata)
         VALUES ($1, $2, 'issue_updated', $3::jsonb)`,
        [updated.id, req.auth.sub, JSON.stringify(changes)],
      );
      return updated;
    });

    emitProjectEvent(io, current.project_id, 'issue:updated', { issue });
    return res.json({ issue });
  } catch (error) {
    return next(error);
  }
});

export default router;
