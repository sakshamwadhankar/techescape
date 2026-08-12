import { Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly client: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(`Corrupt JSON in Redis key ${key}`);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds !== undefined) {
      await this.client.set(key, raw, "EX", ttlSeconds);
    } else {
      await this.client.set(key, raw);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  /**
   * Acquire a lock, run fn, and release the lock.
   * Returns null when the lock could not be acquired.
   */
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const token = `${process.pid}:${Math.random().toString(36).slice(2)}`;
    const acquired = await this.client.set(key, token, "PX", ttlMs, "NX");
    if (acquired !== "OK") return null;

    try {
      return await fn();
    } finally {
      const releaseScript =
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
      await this.client.eval(releaseScript, 1, key, token);
    }
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
