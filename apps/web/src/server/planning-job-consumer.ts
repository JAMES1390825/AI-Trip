import { SimpleConsumer } from "rocketmq-client-nodejs";
import type { ProductionEnv } from "./production-env";
import type { PlanningJobWorker } from "./planning-job-worker";

export type PlanningMessage = {
  messageId: string;
  body: Buffer;
};

export type RocketMqConsumerLike = {
  startup(): Promise<void>;
  shutdown(): Promise<void>;
  receive(maxMessageNum: number, invisibleDuration: number): Promise<PlanningMessage[]>;
  ack(message: PlanningMessage): Promise<void>;
};

export type PlanningJobConsumerBatchSummary = {
  received: number;
  acknowledged: number;
  failed: number;
};

export type PlanningJobConsumerRunSummary = PlanningJobConsumerBatchSummary & {
  batches: number;
};

export type PlanningJobConsumerDaemon = {
  runOnce(): Promise<PlanningJobConsumerBatchSummary>;
  run(options?: { maxBatches?: number }): Promise<PlanningJobConsumerRunSummary>;
  stop(): Promise<void>;
};

export type PlanningJobConsumerDaemonOptions = {
  consumer: RocketMqConsumerLike;
  worker: PlanningJobWorker;
  batchSize?: number;
  invisibleDurationMs?: number;
  idleDelayMs?: number;
};

export type RocketMqPlanningJobConsumerFactoryOptions = {
  SimpleConsumerClass?: new (options: unknown) => RocketMqConsumerLike;
};

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldAck(status: Awaited<ReturnType<PlanningJobWorker["handleEvent"]>>["status"]): boolean {
  return status === "processed" || status === "ignored" || status === "not_found";
}

export function createPlanningJobConsumerDaemon(options: PlanningJobConsumerDaemonOptions): PlanningJobConsumerDaemon {
  const batchSize = options.batchSize || 10;
  const invisibleDurationMs = options.invisibleDurationMs || 120_000;
  const idleDelayMs = options.idleDelayMs ?? 1_000;
  let started = false;
  let stopped = false;

  async function ensureStarted(): Promise<void> {
    if (started) return;
    await options.consumer.startup();
    started = true;
  }

  async function runOnce(): Promise<PlanningJobConsumerBatchSummary> {
    await ensureStarted();
    const messages = await options.consumer.receive(batchSize, invisibleDurationMs);
    let acknowledged = 0;
    let failed = 0;

    for (const message of messages) {
      try {
        const result = await options.worker.handleEvent(message.body);
        if (shouldAck(result.status)) {
          await options.consumer.ack(message);
          acknowledged += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    if (messages.length === 0) await delay(idleDelayMs);
    return {
      received: messages.length,
      acknowledged,
      failed
    };
  }

  return {
    runOnce,
    async run(runOptions = {}) {
      const summary: PlanningJobConsumerRunSummary = {
        batches: 0,
        received: 0,
        acknowledged: 0,
        failed: 0
      };
      while (!stopped && (!runOptions.maxBatches || summary.batches < runOptions.maxBatches)) {
        const batch = await runOnce();
        summary.batches += 1;
        summary.received += batch.received;
        summary.acknowledged += batch.acknowledged;
        summary.failed += batch.failed;
      }
      await this.stop();
      return summary;
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (started) await options.consumer.shutdown();
    }
  };
}

export function createRocketMqPlanningJobConsumer(
  env: ProductionEnv,
  options: RocketMqPlanningJobConsumerFactoryOptions = {},
): RocketMqConsumerLike {
  const SimpleConsumerClass = options.SimpleConsumerClass || SimpleConsumer;
  const sessionCredentials = env.rocketmq.accessKey && env.rocketmq.secretKey
    ? {
        accessKey: env.rocketmq.accessKey,
        accessSecret: env.rocketmq.secretKey
      }
    : undefined;

  return new SimpleConsumerClass({
    endpoints: env.rocketmq.endpoints,
    namespace: env.rocketmq.namespace,
    consumerGroup: env.rocketmq.consumerGroupPlanning,
    subscriptions: new Map([[env.rocketmq.topicPlanning, "planning.job.created"]]),
    ...(sessionCredentials ? { sessionCredentials } : {})
  });
}
