import { createClient } from 'redis';

let client;
let connecting;

function getRedisUrl() {
  return process.env.REDIS_URL;
}

export async function getRedis() {
  const url = getRedisUrl();
  if (!url) return null;
  if (!client) {
    client = createClient({ url });
    client.on('error', (error) => console.error('Redis error:', error));
  }
  if (!client.isOpen) {
    connecting ??= client.connect().finally(() => { connecting = null; });
    await connecting;
  }
  return client;
}

export async function getCache(key) {
  const redis = await getRedis();
  if (!redis) return null;
  return redis.get(key);
}

export async function setCache(key, value, ttlSeconds = 30) {
  const redis = await getRedis();
  if (!redis) return false;
  await redis.set(key, value, { EX: ttlSeconds });
  return true;
}

export async function deleteCacheByPrefix(prefix) {
  const redis = await getRedis();
  if (!redis) return 0;
  let deleted = 0;
  for await (const key of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
    deleted += await redis.del(key);
  }
  return deleted;
}

export async function closeRedis() {
  if (client?.isOpen) await client.quit();
  client = undefined;
}
