import { getRedis } from '../redis.js';

export function rateLimit({ windowSeconds = 60, max = 60, keyPrefix = 'rl' } = {}) {
  return async (req, res, next) => {
    try {
      const redis = await getRedis();
      if (!redis) return next();

      const identity = req.auth?.sub ?? req.ip ?? 'anonymous';
      const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
      const key = `${keyPrefix}:${identity}:${bucket}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      if (count > max) {
        res.setHeader('Retry-After', windowSeconds);
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      return next();
    } catch (error) {
      console.error('Rate limiter unavailable:', error);
      return next();
    }
  };
}
