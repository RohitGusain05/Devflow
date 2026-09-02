import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signAccessToken } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();
const authRateLimit = rateLimit({ windowSeconds: 60, max: 10, keyPrefix: 'auth' });

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(72),
});

router.post('/register', authRateLimit, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid registration data', details: parsed.error.flatten() });
    const { name, email, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`, [name, email, passwordHash]);
    const user = result.rows[0];
    return res.status(201).json({ user, accessToken: signAccessToken(user) });
  } catch (error) {
    if (error?.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    return next(error);
  }
});

router.post('/login', authRateLimit, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid login data' });
    const { email, password } = parsed.data;
    const result = await query(
      `SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1`, [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
    const safeUser = { id: user.id, name: user.name, email: user.email, created_at: user.created_at };
    return res.json({ user: safeUser, accessToken: signAccessToken(safeUser) });
  } catch (error) {
    return next(error);
  }
});

export default router;
