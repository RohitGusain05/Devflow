import jwt from 'jsonwebtoken';

function getSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not configured');
  return secret;
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role ?? 'user' },
    getSecret(),
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m' },
  );
}

export function requireAuth(req, res, next) {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.auth = jwt.verify(token, getSecret());
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}
