import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningJobService } from "@/server/planning-job-service";
import { createPlanningJobRunHandlers } from "./route";

const service: PlanningJobService = {
  async createJob() {
    throw new Error("not used");
  },
  async getJob() {
    return null;
  },
  async runJob(id) {
    if (id !== "job-1") return null;
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

test("POST /api/planning-jobs/:id/run executes a planning job", async () => {
  const { POST } = createPlanningJobRunHandlers(service);
  const response = await POST(new Request("http://localhost/api/planning-jobs/job-1/run", { method: "POST" }), {
    params: Promise.resolve({ id: "job-1" })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.job.status, "completed");
  assert.equal(payload.job.resultPayload.routeCard.id, "card-1");
});

test("POST /api/planning-jobs/:id/run returns 404 for missing jobs", async () => {
  const { POST } = createPlanningJobRunHandlers(service);
  const response = await POST(new Request("http://localhost/api/planning-jobs/missing/run", { method: "POST" }), {
    params: Promise.resolve({ id: "missing" })
  });

  assert.equal(response.status, 404);
});
