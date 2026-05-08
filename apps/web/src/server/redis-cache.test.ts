import assert from "node:assert/strict";
import test from "node:test";
import { createRedisCache } from "./redis-cache";

class FakeRedisClient {
  public values = new Map<string, string>();
  public expirations = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<"OK"> {
    this.values.set(key, value);
    if (options?.EX) this.expirations.set(key, options.EX);
    return "OK";
  }

  async del(key: string): Promise<number> {
    const existed = this.values.delete(key);
    this.expirations.delete(key);
    return existed ? 1 : 0;
  }
}

test("createRedisCache prefixes keys and round-trips JSON values", async () => {
  const client = new FakeRedisClient();
  const cache = createRedisCache(client, { namespace: "ai-trip:test" });

  await cache.setJson("amap:poi:hangzhou", { count: 3 }, 120);
  const value = await cache.getJson<{ count: number }>("amap:poi:hangzhou");

  assert.deepEqual(value, { count: 3 });
  assert.equal(client.values.has("ai-trip:test:amap:poi:hangzhou"), true);
  assert.equal(client.expirations.get("ai-trip:test:amap:poi:hangzhou"), 120);
});

test("createRedisCache returns null for misses and removes namespaced keys", async () => {
  const client = new FakeRedisClient();
  const cache = createRedisCache(client, { namespace: "ai-trip:test" });

  assert.equal(await cache.getJson("missing"), null);
  await cache.setJson("planning:job-1", { status: "running" }, 30);

  assert.equal(await cache.delete("planning:job-1"), true);
  assert.equal(await cache.getJson("planning:job-1"), null);
});
