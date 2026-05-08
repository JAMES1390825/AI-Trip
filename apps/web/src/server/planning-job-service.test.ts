import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningQueue } from "./planning-queue";
import type { PlanningJobRecord, PlanningJobStore } from "./planning-job-store";
import { createPlanningJobService } from "./planning-job-service";

class FakePlanningJobStore implements PlanningJobStore {
  public createdInputs: unknown[] = [];

  async create(input: { tripId?: string; requestPayload: unknown }): Promise<PlanningJobRecord> {
    this.createdInputs.push(input);
    return {
      id: "job-1",
      tripId: input.tripId,
      status: "queued",
      requestPayload: input.requestPayload,
      createdAt: "2026-05-08T10:00:00.000Z",
      updatedAt: "2026-05-08T10:00:00.000Z"
    };
  }

  async get(): Promise<PlanningJobRecord | null> {
    return null;
  }
}

class FakePlanningQueue implements PlanningQueue {
  public events: unknown[] = [];

  async publishPlanningJobCreated(event: unknown): Promise<string> {
    this.events.push(event);
    return "msg-1";
  }
}

test("createPlanningJobService creates a queued job and publishes a RocketMQ planning event", async () => {
  const store = new FakePlanningJobStore();
  const queue = new FakePlanningQueue();
  const service = createPlanningJobService({
    jobStore: store,
    planningQueue: queue,
    now: () => new Date("2026-05-08T10:01:00.000Z")
  });

  const result = await service.createJob({
    tripId: "trip-1",
    idempotencyKey: "device-1:trip-1",
    requestPayload: {
      city: "杭州",
      note: "少走路"
    }
  });

  assert.deepEqual(store.createdInputs[0], {
    tripId: "trip-1",
    requestPayload: {
      city: "杭州",
      note: "少走路"
    }
  });
  assert.deepEqual(queue.events[0], {
    type: "planning.job.created",
    jobId: "job-1",
    tripId: "trip-1",
    idempotencyKey: "device-1:trip-1",
    requestedAt: "2026-05-08T10:01:00.000Z"
  });
  assert.equal(result.queueMessageId, "msg-1");
  assert.equal(result.queueWarning, undefined);
});

test("createPlanningJobService keeps the job queued when queue publishing fails", async () => {
  const store = new FakePlanningJobStore();
  const service = createPlanningJobService({
    jobStore: store,
    planningQueue: {
      async publishPlanningJobCreated() {
        throw new Error("rocketmq down");
      }
    },
    now: () => new Date("2026-05-08T10:01:00.000Z")
  });

  const result = await service.createJob({
    requestPayload: {
      city: "上海"
    }
  });

  assert.equal(result.job.status, "queued");
  assert.equal(result.queueMessageId, undefined);
  assert.equal(result.queueWarning, "planning_queue_unavailable");
});
