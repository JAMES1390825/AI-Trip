export type ProductionEnv = {
  databaseUrl: string;
  redisUrl: string;
  rocketmq: {
    endpoints: string;
    accessKey?: string;
    secretKey?: string;
    namespace: string;
    topicPlanning: string;
    consumerGroupPlanning: string;
  };
  milvus: {
    address: string;
    username?: string;
    password?: string;
    database: string;
  };
  embedding: {
    provider: string;
    model: string;
  };
};

type EnvSource = Record<string, string | undefined>;

function value(env: EnvSource, key: string, fallback: string): string {
  const raw = env[key];
  return raw && raw.trim() ? raw.trim() : fallback;
}

function optionalValue(env: EnvSource, key: string): string | undefined {
  const raw = env[key];
  return raw && raw.trim() ? raw.trim() : undefined;
}

export function readProductionEnv(env: EnvSource = process.env): ProductionEnv {
  return {
    databaseUrl: value(env, "DATABASE_URL", "postgresql://ai_trip:ai_trip@localhost:5432/ai_trip"),
    redisUrl: value(env, "REDIS_URL", "redis://localhost:6379"),
    rocketmq: {
      endpoints: value(env, "ROCKETMQ_ENDPOINT", "localhost:8081"),
      accessKey: optionalValue(env, "ROCKETMQ_ACCESS_KEY"),
      secretKey: optionalValue(env, "ROCKETMQ_SECRET_KEY"),
      namespace: value(env, "ROCKETMQ_NAMESPACE", ""),
      topicPlanning: value(env, "ROCKETMQ_TOPIC_PLANNING", "ai-trip-planning"),
      consumerGroupPlanning: value(env, "ROCKETMQ_CONSUMER_GROUP_PLANNING", "ai-trip-planning-worker")
    },
    milvus: {
      address: value(env, "MILVUS_ADDRESS", "localhost:19530"),
      username: optionalValue(env, "MILVUS_USERNAME"),
      password: optionalValue(env, "MILVUS_PASSWORD"),
      database: value(env, "MILVUS_DATABASE", "ai_trip")
    },
    embedding: {
      provider: value(env, "EMBEDDING_PROVIDER", "bailian"),
      model: value(env, "EMBEDDING_MODEL", "text-embedding-v4")
    }
  };
}
