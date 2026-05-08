import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningJobService } from "@/server/planning-job-service";
import { createPlanningJobDetailHandlers } from "./route";

const service: PlanningJobService = {
  async createJob() {
    throw new Error("not used");
  },
  async getJob(id) {
    if (id !== "job-1") return null;
    return {
      id,
      status: "queued",
      requestPayload: {
        city: "杭州"
      },
      createdAt: "2026-05-08T10:00:00.000Z",
      updatedAt: "2026-05-08T10:00:00.000Z"
    };
  },
  async runJob() {
    throw new Error("not used");
  }
};

test("GET /api/planning-jobs/:id returns an existing planning job", async () => {
  const { GET } = createPlanningJobDetailHandlers(service);
  const response = await GET(new Request("http://localhost/api/planning-jobs/job-1"), {
    params: Promise.resolve({ id: "job-1" })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.job.id, "job-1");
  assert.equal(payload.job.status, "queued");
});

test("GET /api/planning-jobs/:id returns 404 for missing jobs", async () => {
  const { GET } = createPlanningJobDetailHandlers(service);
  const response = await GET(new Request("http://localhost/api/planning-jobs/missing"), {
    params: Promise.resolve({ id: "missing" })
  });

  assert.equal(response.status, 404);
});
