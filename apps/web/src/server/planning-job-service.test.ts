import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningQueue } from "./planning-queue";
import type { PlanningTraceEvent } from "@/domain/types";
import type { PlanningJobRecord, PlanningJobStore } from "./planning-job-store";
import { createPlanningJobService, type PlanningJobRunner } from "./planning-job-service";

class FakePlanningJobStore implements PlanningJobStore {
  public createdInputs: unknown[] = [];
  public traceEvents: PlanningTraceEvent[] = [];
  private storedJob: PlanningJobRecord | null = null;

  async create(input: { tripId?: string; requestPayload: unknown }): Promise<PlanningJobRecord> {
    this.createdInputs.push(input);
    this.storedJob = {
      id: "job-1",
      tripId: input.tripId,
      status: "queued",
      requestPayload: input.requestPayload,
      createdAt: "2026-05-08T10:00:00.000Z",
      updatedAt: "2026-05-08T10:00:00.000Z"
    };
    return this.storedJob;
  }

  async get(id?: string): Promise<PlanningJobRecord | null> {
    if (id && id !== "job-1") return null;
    return this.storedJob;
  }

  async markRunning(): Promise<PlanningJobRecord> {
    throw new Error("not used");
  }

  async markCompleted(): Promise<PlanningJobRecord> {
    throw new Error("not used");
  }

  async markFailed(): Promise<PlanningJobRecord> {
    throw new Error("not used");
  }

  async appendTraceEvents(): Promise<void> {
    throw new Error("not used");
  }

  async listTraceEvents(): Promise<PlanningTraceEvent[]> {
    return this.traceEvents;
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

test("createPlanningJobService can run a planning job through an executor", async () => {
  const runner: PlanningJobRunner = {
    async executeJob(id) {
      return {
        id,
        status: "completed",
        requestPayload: {},
        resultPayload: {
          routeCard: { id: "card-1" }
        },
        createdAt: "2026-05-08T10:00:00.000Z",
        updatedAt: "2026-05-08T10:02:00.000Z"
      };
    }
  };
  const service = createPlanningJobService({
    jobStore: new FakePlanningJobStore(),
    planningQueue: new FakePlanningQueue(),
    runner
  });

  const result = await service.runJob("job-1");

  assert.equal(result?.status, "completed");
  assert.deepEqual(result?.resultPayload, {
    routeCard: { id: "card-1" }
  });
});

test("createPlanningJobService returns persisted trace events with job details", async () => {
  const store = new FakePlanningJobStore();
  const created = await store.create({
    requestPayload: {
      city: "杭州"
    }
  });
  store.traceEvents = [
    {
      nodeId: "intent_agent",
      label: "理解旅行需求",
      status: "done",
      detail: "想拍照，少走路"
    }
  ];
  const service = createPlanningJobService({
    jobStore: store,
    planningQueue: new FakePlanningQueue()
  });

  const job = await service.getJob(created.id);

  assert.deepEqual(job?.traceEvents, store.traceEvents);
});

test("createPlanningJobService decorates executed jobs with persisted trace events", async () => {
  const store = new FakePlanningJobStore();
  store.traceEvents = [
    {
      nodeId: "composer",
      label: "输出地图 + 每日行程",
      status: "done"
    }
  ];
  const runner: PlanningJobRunner = {
    async executeJob(id) {
      return {
        id,
        status: "completed",
        requestPayload: {},
        resultPayload: {
          routeCard: { id: "card-1" }
        },
        createdAt: "2026-05-08T10:00:00.000Z",
        updatedAt: "2026-05-08T10:02:00.000Z"
      };
    }
  };
  const service = createPlanningJobService({
    jobStore: store,
    planningQueue: new FakePlanningQueue(),
    runner
  });

  const job = await service.runJob("job-1");

  assert.deepEqual(job?.traceEvents, store.traceEvents);
});
