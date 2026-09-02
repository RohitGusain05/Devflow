import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import http from 'node:http';
import { query } from './db.js';
import authRouter from './routes/auth.js';
import workspaceRouter from './routes/workspaces.js';
import issueRouter from './routes/issues.js';
import commentRouter from './routes/comments.js';
import { requireAuth } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';
import { attachRealtime } from './realtime.js';

const app = express();
const httpServer = http.createServer(app);
const io = attachRealtime(httpServer);
const apiRateLimit = rateLimit({ windowSeconds: 60, max: 120, keyPrefix: 'api' });

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL ?? 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', apiRateLimit);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'devflow-api' }));
app.get('/api/health/db', async (_req, res, next) => {
  try { await query('SELECT 1'); res.json({ status: 'ok', database: 'postgresql' }); }
  catch (error) { next(error); }
});

app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api', issueRouter);
app.use('/api', commentRouter);

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const result = await query(`SELECT id, name, email, created_at, updated_at FROM users WHERE id = $1`, [req.auth.sub]);
    if (!result.rows[0]) return res.status(401).json({ error: 'User account no longer exists' });
    return res.json({ user: result.rows[0] });
  } catch (error) { return next(error); }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err?.code === '23505') return res.status(409).json({ error: 'Resource already exists' });
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(port, () => console.log(`DevFlow API listening on port ${port}`));
}

export { io };
export default app;
