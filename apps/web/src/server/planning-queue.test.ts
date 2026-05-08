import assert from "node:assert/strict";
import test from "node:test";
import { createRocketMqPlanningQueue, type PlanningJobCreatedEvent } from "./planning-queue";

class FakeRocketMqProducer {
  public messages: unknown[] = [];

  async send(message: unknown): Promise<{ messageId: string }> {
    this.messages.push(message);
    return { messageId: "msg-1" };
  }
}

test("createRocketMqPlanningQueue publishes planning job events to configured topic", async () => {
  const producer = new FakeRocketMqProducer();
  const queue = createRocketMqPlanningQueue(producer, {
    topicPlanning: "ai-trip-planning"
  });
  const event: PlanningJobCreatedEvent = {
    type: "planning.job.created",
    jobId: "job-1",
    tripId: "trip-1",
    idempotencyKey: "device-1:job-1",
    requestedAt: "2026-05-08T10:00:00.000Z"
  };

  const messageId = await queue.publishPlanningJobCreated(event);

  assert.equal(messageId, "msg-1");
  assert.deepEqual(producer.messages[0], {
    topic: "ai-trip-planning",
    tag: "planning.job.created",
    keys: ["job-1", "trip-1", "device-1:job-1"],
    body: Buffer.from(JSON.stringify(event))
  });
});

test("createRocketMqPlanningQueue omits optional keys without corrupting the event body", async () => {
  const producer = new FakeRocketMqProducer();
  const queue = createRocketMqPlanningQueue(producer, {
    topicPlanning: "ai-trip-planning"
  });
  const event: PlanningJobCreatedEvent = {
    type: "planning.job.created",
    jobId: "job-2",
    requestedAt: "2026-05-08T10:00:00.000Z"
  };

  await queue.publishPlanningJobCreated(event);

  assert.deepEqual(producer.messages[0], {
    topic: "ai-trip-planning",
    tag: "planning.job.created",
    keys: ["job-2"],
    body: Buffer.from(JSON.stringify(event))
  });
});
