import assert from "node:assert/strict";
import test from "node:test";
import { readProductionEnv } from "./production-env";

test("readProductionEnv returns typed defaults for local platform services", () => {
  const env = readProductionEnv({});

  assert.equal(env.databaseUrl, "postgresql://ai_trip:ai_trip@localhost:5432/ai_trip");
  assert.equal(env.redisUrl, "redis://localhost:6379");
  assert.equal(env.rocketmq.endpoints, "localhost:8081");
  assert.equal(env.rocketmq.namespace, "");
  assert.equal(env.rocketmq.topicPlanning, "ai-trip-planning");
  assert.equal(env.rocketmq.consumerGroupPlanning, "ai-trip-planning-worker");
  assert.equal(env.milvus.address, "localhost:19530");
  assert.equal(env.milvus.database, "ai_trip");
  assert.equal(env.embedding.provider, "bailian");
  assert.equal(env.embedding.model, "text-embedding-v4");
});

test("readProductionEnv preserves provided production service values", () => {
  const env = readProductionEnv({
    DATABASE_URL: "postgresql://prod/app",
    REDIS_URL: "redis://redis.internal:6379",
    ROCKETMQ_ENDPOINT: "rmq.internal:8081",
    ROCKETMQ_ACCESS_KEY: "ak",
    ROCKETMQ_SECRET_KEY: "sk",
    ROCKETMQ_NAMESPACE: "travel-prod",
    ROCKETMQ_TOPIC_PLANNING: "planning-prod",
    ROCKETMQ_CONSUMER_GROUP_PLANNING: "planning-workers-prod",
    MILVUS_ADDRESS: "milvus.internal:19530",
    MILVUS_USERNAME: "root",
    MILVUS_PASSWORD: "secret",
    MILVUS_DATABASE: "prod_ai_trip",
    EMBEDDING_PROVIDER: "openai",
    EMBEDDING_MODEL: "text-embedding-3-large"
  });

  assert.equal(env.databaseUrl, "postgresql://prod/app");
  assert.equal(env.redisUrl, "redis://redis.internal:6379");
  assert.equal(env.rocketmq.endpoints, "rmq.internal:8081");
  assert.equal(env.rocketmq.accessKey, "ak");
  assert.equal(env.rocketmq.secretKey, "sk");
  assert.equal(env.rocketmq.namespace, "travel-prod");
  assert.equal(env.rocketmq.topicPlanning, "planning-prod");
  assert.equal(env.rocketmq.consumerGroupPlanning, "planning-workers-prod");
  assert.equal(env.milvus.address, "milvus.internal:19530");
  assert.equal(env.milvus.username, "root");
  assert.equal(env.milvus.password, "secret");
  assert.equal(env.milvus.database, "prod_ai_trip");
  assert.equal(env.embedding.provider, "openai");
  assert.equal(env.embedding.model, "text-embedding-3-large");
});
