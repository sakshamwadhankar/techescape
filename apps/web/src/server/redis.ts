import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`Corrupt JSON in Redis key ${key}`);
    return null;
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (ttlSeconds !== undefined) {
    await redis.set(key, raw, "EX", ttlSeconds);
  } else {
    await redis.set(key, raw);
  }
}

export async function del(...keys: string[]): Promise<void> {
  if (keys.length > 0) await redis.del(...keys);
}

export async function rpush(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  await redis.rpush(key, JSON.stringify(value));
  if (ttlSeconds !== undefined) await redis.expire(key, ttlSeconds);
}

export async function lrange<T>(key: string, start = 0, stop = -1): Promise<T[]> {
  const raw = await redis.lrange(key, start, stop);
  return raw.map((item) => JSON.parse(item) as T);
}

export async function delPattern(pattern: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      200,
    );
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
}

export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const token = `${process.pid}:${Math.random().toString(36).slice(2)}`;
  const acquired = await redis.set(key, token, "PX", ttlMs, "NX");
  if (acquired !== "OK") return null;

  try {
    return await fn();
  } finally {
    const releaseScript =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await redis.eval(releaseScript, 1, key, token);
  }
}
