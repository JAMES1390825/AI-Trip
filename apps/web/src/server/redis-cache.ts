import { createClient } from "redis";
import { readProductionEnv } from "./production-env";

export type RedisJsonClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
};

export type RedisCache = {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;
};

export type RedisCacheOptions = {
  namespace?: string;
};

function namespacedKey(namespace: string, key: string): string {
  const cleanKey = key.replace(/^:+/, "");
  return `${namespace}:${cleanKey}`;
}

export function createRedisCache(
  client: RedisJsonClient,
  options: RedisCacheOptions = {},
): RedisCache {
  const namespace = options.namespace || "ai-trip";

  return {
    async getJson<T>(key: string) {
      const raw = await client.get(namespacedKey(namespace, key));
      return raw ? JSON.parse(raw) as T : null;
    },
    async setJson<T>(key: string, value: T, ttlSeconds: number) {
      await client.set(namespacedKey(namespace, key), JSON.stringify(value), { EX: ttlSeconds });
    },
    async delete(key: string) {
      return (await client.del(namespacedKey(namespace, key))) > 0;
    }
  };
}

export function createRedisClientFromEnv(env = readProductionEnv()) {
  return createClient({ url: env.redisUrl });
}
