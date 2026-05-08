import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";
import type { RouteCardRequest } from "@/domain/types";
import type { PlanningJobRecord, PlanningJobStore } from "./planning-job-store";
import { createPlanningJobExecutor } from "./planning-job-executor";

class FakePlanningJobStore implements PlanningJobStore {
  public jobs = new Map<string, PlanningJobRecord>();
  public transitions: string[] = [];

  async create(): Promise<PlanningJobRecord> {
    throw new Error("not used");
  }

  async get(id: string): Promise<PlanningJobRecord | null> {
    return this.jobs.get(id) || null;
  }

  async markRunning(id: string, startedAt: Date): Promise<PlanningJobRecord> {
    this.transitions.push(`running:${startedAt.toISOString()}`);
    const job = this.jobs.get(id);
    if (!job) throw new Error("missing");
    const next = { ...job, status: "running" as const, startedAt: startedAt.toISOString() };
    this.jobs.set(id, next);
    return next;
  }

  async markCompleted(id: string, resultPayload: unknown, finishedAt: Date): Promise<PlanningJobRecord> {
    this.transitions.push(`completed:${finishedAt.toISOString()}`);
    const job = this.jobs.get(id);
    if (!job) throw new Error("missing");
    const next = { ...job, status: "completed" as const, resultPayload, finishedAt: finishedAt.toISOString() };
    this.jobs.set(id, next);
    return next;
  }

  async markFailed(id: string, errorCode: string, finishedAt: Date): Promise<PlanningJobRecord> {
    this.transitions.push(`failed:${errorCode}:${finishedAt.toISOString()}`);
    const job = this.jobs.get(id);
    if (!job) throw new Error("missing");
    const next = { ...job, status: "failed" as const, errorCode, finishedAt: finishedAt.toISOString() };
    this.jobs.set(id, next);
    return next;
  }
}

const requestPayload: RouteCardRequest = {
  city: "杭州",
  themeId: "easy_citywalk",
  startDate: "2026-05-10",
  endDate: "2026-05-10",
  durationDays: 1,
  note: "少走路"
};

test("createPlanningJobExecutor completes a queued planning job with graph result", async () => {
  const store = new FakePlanningJobStore();
  store.jobs.set("job-1", {
    id: "job-1",
    status: "queued",
    requestPayload,
    createdAt: "2026-05-08T10:00:00.000Z",
    updatedAt: "2026-05-08T10:00:00.000Z"
  });
  const executor = createPlanningJobExecutor({
    jobStore: store,
    now: (() => {
      const dates = [
        new Date("2026-05-08T10:01:00.000Z"),
        new Date("2026-05-08T10:02:00.000Z")
      ];
      return () => dates.shift() || new Date("2026-05-08T10:03:00.000Z");
    })(),
    generateRoute: async (request) => ({
      routeCard: { ...generateRouteCard(request), id: "card-1" },
      planningTrace: []
    })
  });

  const result = await executor.executeJob("job-1");

  assert.ok(result);
  assert.equal(result.status, "completed");
  const resultPayload = result.resultPayload as { routeCard: { id: string; city: string }; planningTrace: unknown[] };
  assert.equal(resultPayload.routeCard.id, "card-1");
  assert.equal(resultPayload.routeCard.city, "杭州");
  assert.deepEqual(resultPayload.planningTrace, []);
  assert.deepEqual(store.transitions, [
    "running:2026-05-08T10:01:00.000Z",
    "completed:2026-05-08T10:02:00.000Z"
  ]);
});

test("createPlanningJobExecutor marks invalid or missing jobs failed safely", async () => {
  const store = new FakePlanningJobStore();
  store.jobs.set("job-2", {
    id: "job-2",
    status: "queued",
    requestPayload: { city: "杭州" },
    createdAt: "2026-05-08T10:00:00.000Z",
    updatedAt: "2026-05-08T10:00:00.000Z"
  });
  const executor = createPlanningJobExecutor({
    jobStore: store,
    now: () => new Date("2026-05-08T10:04:00.000Z"),
    generateRoute: async () => {
      throw new Error("should not run");
    }
  });

  assert.equal(await executor.executeJob("missing"), null);
  const failed = await executor.executeJob("job-2");

  assert.equal(failed?.status, "failed");
  assert.equal(failed?.errorCode, "invalid_request_payload");
});

test("createPlanningJobExecutor marks graph failures as failed", async () => {
  const store = new FakePlanningJobStore();
  store.jobs.set("job-3", {
    id: "job-3",
    status: "queued",
    requestPayload,
    createdAt: "2026-05-08T10:00:00.000Z",
    updatedAt: "2026-05-08T10:00:00.000Z"
  });
  const executor = createPlanningJobExecutor({
    jobStore: store,
    now: () => new Date("2026-05-08T10:05:00.000Z"),
    generateRoute: async () => {
      throw new Error("amap timeout");
    }
  });

  const failed = await executor.executeJob("job-3");

  assert.equal(failed?.status, "failed");
  assert.equal(failed?.errorCode, "planning_execution_failed");
});
