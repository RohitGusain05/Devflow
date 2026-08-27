import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const uuidSchema = z.string().uuid();
const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(['admin', 'member']).default('member'),
});
const projectSchema = z.object({
  name: z.string().trim().min(2).max(160),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,11}$/),
  description: z.string().trim().max(2000).optional().nullable(),
});

function badRequest(res, parsed) {
  return res.status(400).json({ error: 'Invalid request data', details: parsed.error.flatten() });
}

async function getMembership(workspaceId, userId) {
  const result = await query(
    `SELECT wm.workspace_id, wm.user_id, wm.role
     FROM workspace_members wm
     WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
    [workspaceId, userId],
  );
  return result.rows[0] ?? null;
}

router.post('/', async (req, res, next) => {
  try {
    const parsed = workspaceSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed);

    const workspace = await withTransaction(async (client) => {
      const workspaceResult = await client.query(
        `INSERT INTO workspaces (name, owner_id) VALUES ($1, $2)
         RETURNING id, name, owner_id, created_at`,
        [parsed.data.name, req.auth.sub],
      );
      const created = workspaceResult.rows[0];
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [created.id, req.auth.sub],
      );
      return created;
    });

    return res.status(201).json({ workspace });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT w.id, w.name, w.owner_id, wm.role, w.created_at,
              COUNT(DISTINCT wm_all.user_id)::int AS member_count
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
       LEFT JOIN workspace_members wm_all ON wm_all.workspace_id = w.id
       GROUP BY w.id, wm.role
       ORDER BY w.created_at DESC`,
      [req.auth.sub],
    );
    return res.json({ workspaces: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/:workspaceId', async (req, res, next) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.workspaceId);
    if (!parsedId.success) return res.status(400).json({ error: 'Invalid workspace ID' });

    const result = await query(
      `SELECT w.id, w.name, w.owner_id, w.created_at, wm.role,
              COUNT(DISTINCT wm_all.user_id)::int AS member_count,
              COUNT(DISTINCT p.id)::int AS project_count
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $2
       LEFT JOIN workspace_members wm_all ON wm_all.workspace_id = w.id
       LEFT JOIN projects p ON p.workspace_id = w.id
       WHERE w.id = $1
       GROUP BY w.id, wm.role`,
      [parsedId.data, req.auth.sub],
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Workspace not found' });
    return res.json({ workspace: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post('/:workspaceId/members', async (req, res, next) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.workspaceId);
    const parsedBody = memberSchema.safeParse(req.body);
    if (!parsedId.success) return res.status(400).json({ error: 'Invalid workspace ID' });
    if (!parsedBody.success) return badRequest(res, parsedBody);

    const actor = await getMembership(parsedId.data, req.auth.sub);
    if (!actor || !['owner', 'admin'].includes(actor.role)) {
      return res.status(403).json({ error: 'Owner or admin access required' });
    }

    const target = await query('SELECT id, name, email FROM users WHERE email = $1', [parsedBody.data.email]);
    if (!target.rows[0]) return res.status(404).json({ error: 'User account not found' });

    const result = await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING workspace_id, user_id, role, joined_at`,
      [parsedId.data, target.rows[0].id, parsedBody.data.role],
    );

    return res.status(201).json({ member: { ...result.rows[0], user: target.rows[0] } });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'User is already a workspace member' });
    return next(error);
  }
});

router.post('/:workspaceId/projects', async (req, res, next) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.workspaceId);
    const parsedBody = projectSchema.safeParse(req.body);
    if (!parsedId.success) return res.status(400).json({ error: 'Invalid workspace ID' });
    if (!parsedBody.success) return badRequest(res, parsedBody);

    const membership = await getMembership(parsedId.data, req.auth.sub);
    if (!membership) return res.status(403).json({ error: 'Workspace membership required' });
    if (!['owner', 'admin'].includes(membership.role)) {
      return res.status(403).json({ error: 'Owner or admin access required to create projects' });
    }

    const result = await query(
      `INSERT INTO projects (workspace_id, name, key, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, workspace_id, name, key, description, created_at`,
      [parsedId.data, parsedBody.data.name, parsedBody.data.key, parsedBody.data.description ?? null],
    );

    return res.status(201).json({ project: result.rows[0] });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'Project key already exists in this workspace' });
    return next(error);
  }
});

router.get('/:workspaceId/projects', async (req, res, next) => {
  try {
    const parsedId = uuidSchema.safeParse(req.params.workspaceId);
    if (!parsedId.success) return res.status(400).json({ error: 'Invalid workspace ID' });

    const membership = await getMembership(parsedId.data, req.auth.sub);
    if (!membership) return res.status(403).json({ error: 'Workspace membership required' });

    const result = await query(
      `SELECT p.id, p.workspace_id, p.name, p.key, p.description, p.created_at,
              COUNT(i.id)::int AS issue_count
       FROM projects p
       LEFT JOIN issues i ON i.project_id = p.id
       WHERE p.workspace_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [parsedId.data],
    );
    return res.json({ projects: result.rows });
  } catch (error) {
    return next(error);
  }
});

export default router;
