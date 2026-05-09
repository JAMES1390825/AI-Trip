import assert from "node:assert/strict";
import test from "node:test";
import type { ProductionEnv } from "./production-env";
import type { PlanningJobWorker, PlanningJobWorkerResult } from "./planning-job-worker";
import { createPlanningJobConsumerDaemon, createRocketMqPlanningJobConsumer } from "./planning-job-consumer";

type FakeMessage = {
  messageId: string;
  body: Buffer;
};

class FakeRocketMqConsumer {
  public startupCalls = 0;
  public shutdownCalls = 0;
  public receiveCalls: Array<{ maxMessageNum: number; invisibleDuration: number }> = [];
  public acked: string[] = [];
  public batches: FakeMessage[][] = [];

  constructor(batches: FakeMessage[][]) {
    this.batches = batches;
  }

  async startup(): Promise<void> {
    this.startupCalls += 1;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalls += 1;
  }

  async receive(maxMessageNum: number, invisibleDuration: number): Promise<FakeMessage[]> {
    this.receiveCalls.push({ maxMessageNum, invisibleDuration });
    return this.batches.shift() || [];
  }

  async ack(message: FakeMessage): Promise<void> {
    this.acked.push(message.messageId);
  }
}

function message(messageId: string, jobId: string): FakeMessage {
  return {
    messageId,
    body: Buffer.from(JSON.stringify({
      type: "planning.job.created",
      jobId,
      requestedAt: "2026-05-10T00:00:00.000Z"
    }))
  };
}

function workerWithResults(results: PlanningJobWorkerResult[]): PlanningJobWorker {
  return {
    async handleEvent() {
      const result = results.shift();
      if (!result) throw new Error("unexpected message");
      return result;
    }
  };
}

test("createPlanningJobConsumerDaemon starts consumer, processes one batch, and acks successful messages", async () => {
  const consumer = new FakeRocketMqConsumer([[message("msg-1", "job-1"), message("msg-2", "job-2")]]);
  const daemon = createPlanningJobConsumerDaemon({
    consumer,
    worker: workerWithResults([
      { status: "processed", jobId: "job-1", jobStatus: "completed" },
      { status: "ignored", reason: "invalid_event" }
    ]),
    batchSize: 8,
    invisibleDurationMs: 60_000,
    idleDelayMs: 0
  });

  const summary = await daemon.runOnce();

  assert.equal(consumer.startupCalls, 1);
  assert.deepEqual(consumer.receiveCalls, [{ maxMessageNum: 8, invisibleDuration: 60_000 }]);
  assert.deepEqual(consumer.acked, ["msg-1", "msg-2"]);
  assert.deepEqual(summary, {
    received: 2,
    acknowledged: 2,
    failed: 0
  });
  await daemon.stop();
  assert.equal(consumer.shutdownCalls, 1);
});

test("createPlanningJobConsumerDaemon leaves failed planning jobs unacked for RocketMQ redelivery", async () => {
  const consumer = new FakeRocketMqConsumer([[message("msg-1", "job-1"), message("msg-2", "job-2")]]);
  const daemon = createPlanningJobConsumerDaemon({
    consumer,
    worker: workerWithResults([
      { status: "failed", jobId: "job-1", errorCode: "planning_execution_failed" },
      { status: "not_found", jobId: "job-2" }
    ]),
    idleDelayMs: 0
  });

  const summary = await daemon.runOnce();

  assert.deepEqual(consumer.acked, ["msg-2"]);
  assert.deepEqual(summary, {
    received: 2,
    acknowledged: 1,
    failed: 1
  });
});

test("createPlanningJobConsumerDaemon leaves thrown messages unacked and continues the batch", async () => {
  const consumer = new FakeRocketMqConsumer([[message("msg-1", "job-1"), message("msg-2", "job-2")]]);
  const daemon = createPlanningJobConsumerDaemon({
    consumer,
    worker: {
      async handleEvent(body: Buffer) {
        const event = JSON.parse(body.toString("utf8")) as { jobId: string };
        if (event.jobId === "job-1") throw new Error("temporary planner outage");
        return { status: "processed", jobId: event.jobId, jobStatus: "completed" };
      }
    },
    idleDelayMs: 0
  });

  const summary = await daemon.runOnce();

  assert.deepEqual(consumer.acked, ["msg-2"]);
  assert.deepEqual(summary, {
    received: 2,
    acknowledged: 1,
    failed: 1
  });
});

test("createPlanningJobConsumerDaemon can run a bounded daemon loop", async () => {
  const consumer = new FakeRocketMqConsumer([[message("msg-1", "job-1")], []]);
  const daemon = createPlanningJobConsumerDaemon({
    consumer,
    worker: workerWithResults([{ status: "processed", jobId: "job-1", jobStatus: "completed" }]),
    idleDelayMs: 0
  });

  const summary = await daemon.run({ maxBatches: 2 });

  assert.equal(consumer.startupCalls, 1);
  assert.equal(consumer.shutdownCalls, 1);
  assert.deepEqual(consumer.acked, ["msg-1"]);
  assert.deepEqual(summary, {
    batches: 2,
    received: 1,
    acknowledged: 1,
    failed: 0
  });
});

test("createRocketMqPlanningJobConsumer builds a SimpleConsumer from production env", () => {
  const createdOptions: unknown[] = [];
  const env: ProductionEnv = {
    databaseUrl: "postgresql://local/app",
    redisUrl: "redis://local",
    rocketmq: {
      endpoints: "localhost:8081",
      namespace: "travel-prod",
      topicPlanning: "ai-trip-planning",
      consumerGroupPlanning: "ai-trip-planning-worker",
      accessKey: "ak",
      secretKey: "sk"
    },
    milvus: {
      address: "localhost:19530",
      database: "ai_trip"
    },
    embedding: {
      provider: "bailian",
      model: "text-embedding-v4"
    }
  };

  const consumer = createRocketMqPlanningJobConsumer(env, {
    SimpleConsumerClass: class {
      constructor(options: unknown) {
        createdOptions.push(options);
      }

      async startup(): Promise<void> {}

      async shutdown(): Promise<void> {}

      async receive(): Promise<FakeMessage[]> {
        return [];
      }

      async ack(): Promise<void> {}
    }
  });

  assert.ok(consumer);
  assert.deepEqual(createdOptions, [
    {
      endpoints: "localhost:8081",
      namespace: "travel-prod",
      consumerGroup: "ai-trip-planning-worker",
      subscriptions: new Map([["ai-trip-planning", "planning.job.created"]]),
      sessionCredentials: {
        accessKey: "ak",
        accessSecret: "sk"
      }
    }
  ]);
});
