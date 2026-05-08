import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningJobService } from "@/server/planning-job-service";
import { createPlanningJobsHandlers } from "./route";

const fakeService: PlanningJobService = {
  async createJob(request) {
    return {
      job: {
        id: "job-1",
        tripId: request.tripId,
        status: "queued",
        requestPayload: request.requestPayload,
        createdAt: "2026-05-08T10:00:00.000Z",
        updatedAt: "2026-05-08T10:00:00.000Z"
      },
      queueMessageId: "msg-1"
    };
  },
  async getJob() {
    return null;
  },
  async runJob(id) {
    return {
      id,
      status: "completed",
      requestPayload: {},
      resultPayload: {
        routeCard: { id: "card-1" },
        planningTrace: []
      },
      createdAt: "2026-05-08T10:00:00.000Z",
      updatedAt: "2026-05-08T10:02:00.000Z"
    };
  }
};

test("POST /api/planning-jobs creates a queued planning job", async () => {
  const { POST } = createPlanningJobsHandlers(fakeService);

  const response = await POST(
    new Request("http://localhost/api/planning-jobs", {
      method: "POST",
      headers: {
        "Idempotency-Key": "device-1:trip-1"
      },
      body: JSON.stringify({
        tripId: "trip-1",
        request: {
          city: "杭州",
          note: "少走路"
        }
      })
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.job.id, "job-1");
  assert.equal(payload.job.status, "queued");
  assert.equal(payload.queueMessageId, "msg-1");
});

test("POST /api/planning-jobs rejects missing request payload", async () => {
  const { POST } = createPlanningJobsHandlers(fakeService);

  const response = await POST(
    new Request("http://localhost/api/planning-jobs", {
      method: "POST",
      body: JSON.stringify({ tripId: "trip-1" })
    }),
  );

  assert.equal(response.status, 400);
});

test("POST /api/planning-jobs can run the job immediately for web fallback execution", async () => {
  const { POST } = createPlanningJobsHandlers(fakeService);

  const response = await POST(
    new Request("http://localhost/api/planning-jobs", {
      method: "POST",
      body: JSON.stringify({
        request: {
          city: "杭州",
          note: "少走路"
        },
        runImmediately: true
      })
    }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.job.status, "completed");
  assert.equal(payload.job.resultPayload.routeCard.id, "card-1");
});
