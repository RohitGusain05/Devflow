import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const commentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

async function issueAccess(issueId, userId) {
  const result = await query(
    `SELECT i.id, i.project_id, p.workspace_id
     FROM issues i
     JOIN projects p ON p.id = i.project_id
     JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
     WHERE i.id = $1 AND wm.user_id = $2`,
    [issueId, userId],
  );
  return result.rows[0] ?? null;
}

router.get('/issues/:issueId/comments', async (req, res, next) => {
  const issueId = uuid.safeParse(req.params.issueId);
  if (!issueId.success) return res.status(400).json({ error: 'Invalid issue ID' });
  try {
    const access = await issueAccess(issueId.data, req.auth.sub);
    if (!access) return res.status(404).json({ error: 'Issue not found' });
    const result = await query(
      `SELECT c.id, c.issue_id, c.body, c.created_at, c.updated_at,
              u.id AS author_id, u.name AS author_name
       FROM issue_comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.issue_id = $1
       ORDER BY c.created_at ASC`,
      [issueId.data],
    );
    return res.json({ comments: result.rows });
  } catch (error) { return next(error); }
});

router.post('/issues/:issueId/comments', async (req, res, next) => {
  const issueId = uuid.safeParse(req.params.issueId);
  const body = commentSchema.safeParse(req.body);
  if (!issueId.success || !body.success) return res.status(400).json({ error: 'Invalid comment data' });
  try {
    const access = await issueAccess(issueId.data, req.auth.sub);
    if (!access) return res.status(404).json({ error: 'Issue not found' });

    const comment = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO issue_comments (issue_id, author_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, issue_id, author_id, body, created_at, updated_at`,
        [issueId.data, req.auth.sub, body.data.body],
      );
      await client.query(
        `INSERT INTO issue_activity (issue_id, actor_id, action, metadata)
         VALUES ($1, $2, 'comment_added', jsonb_build_object('commentId', $3::text))`,
        [issueId.data, req.auth.sub, result.rows[0].id],
      );
      return result.rows[0];
    });
    return res.status(201).json({ comment });
  } catch (error) { return next(error); }
});

export default router;
