import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningJobService } from "./planning-job-service";
import { createPlanningJobWorker, parsePlanningJobCreatedEvent } from "./planning-job-worker";

function serviceWithRunJob(runJob: PlanningJobService["runJob"]): PlanningJobService {
  return {
    async createJob() {
      throw new Error("not used");
    },
    async getJob() {
      throw new Error("not used");
    },
    runJob
  };
}

test("parsePlanningJobCreatedEvent accepts RocketMQ body buffers", () => {
  const event = parsePlanningJobCreatedEvent(
    Buffer.from(JSON.stringify({
      type: "planning.job.created",
      jobId: "job-1",
      tripId: "trip-1",
      requestedAt: "2026-05-08T10:00:00.000Z"
    })),
  );

  assert.deepEqual(event, {
    type: "planning.job.created",
    jobId: "job-1",
    tripId: "trip-1",
    requestedAt: "2026-05-08T10:00:00.000Z"
  });
});

test("parsePlanningJobCreatedEvent rejects invalid or unsupported events", () => {
  assert.equal(parsePlanningJobCreatedEvent("not json"), null);
  assert.equal(parsePlanningJobCreatedEvent({ type: "unknown", jobId: "job-1" }), null);
  assert.equal(parsePlanningJobCreatedEvent({ type: "planning.job.created", jobId: "" }), null);
});

test("createPlanningJobWorker executes planning jobs from created events", async () => {
  const calls: string[] = [];
  const worker = createPlanningJobWorker({
    service: serviceWithRunJob(async (id) => {
      calls.push(id);
      return {
        id,
        status: "completed",
        requestPayload: {},
        createdAt: "2026-05-08T10:00:00.000Z",
        updatedAt: "2026-05-08T10:02:00.000Z"
      };
    })
  });

  const result = await worker.handleEvent({
    type: "planning.job.created",
    jobId: "job-1",
    requestedAt: "2026-05-08T10:00:00.000Z"
  });

  assert.deepEqual(calls, ["job-1"]);
  assert.deepEqual(result, {
    status: "processed",
    jobId: "job-1",
    jobStatus: "completed"
  });
});

test("createPlanningJobWorker reports missing and failed planning jobs", async () => {
  const missingWorker = createPlanningJobWorker({
    service: serviceWithRunJob(async () => null)
  });
  const failedWorker = createPlanningJobWorker({
    service: serviceWithRunJob(async (id) => ({
      id,
      status: "failed",
      requestPayload: {},
      errorCode: "planning_execution_failed",
      createdAt: "2026-05-08T10:00:00.000Z",
      updatedAt: "2026-05-08T10:02:00.000Z"
    }))
  });

  assert.deepEqual(await missingWorker.handleEvent({ type: "planning.job.created", jobId: "missing", requestedAt: "2026-05-08T10:00:00.000Z" }), {
    status: "not_found",
    jobId: "missing"
  });
  assert.deepEqual(await failedWorker.handleEvent({ type: "planning.job.created", jobId: "job-2", requestedAt: "2026-05-08T10:00:00.000Z" }), {
    status: "failed",
    jobId: "job-2",
    errorCode: "planning_execution_failed"
  });
});

test("createPlanningJobWorker ignores invalid event bodies", async () => {
  const worker = createPlanningJobWorker({
    service: serviceWithRunJob(async () => {
      throw new Error("should not run");
    })
  });

  assert.deepEqual(await worker.handleEvent("not json"), {
    status: "ignored",
    reason: "invalid_event"
  });
});
