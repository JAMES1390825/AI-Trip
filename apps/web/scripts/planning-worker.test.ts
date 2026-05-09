import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningJobRecord } from "../src/server/planning-job-store";
import { runPlanningWorkerCli } from "./planning-worker";

function planningJob(id: string, status: PlanningJobRecord["status"]): PlanningJobRecord {
  return {
    id,
    status,
    requestPayload: {},
    createdAt: "2026-05-08T10:00:00.000Z",
    updatedAt: "2026-05-08T10:02:00.000Z"
  };
}

test("runPlanningWorkerCli executes the requested planning job id", async () => {
  const calls: string[] = [];
  const code = await runPlanningWorkerCli({
    argv: ["node", "planning-worker", "job-1"],
    executeJob: async (id) => {
      calls.push(id);
      return planningJob(id, "completed");
    },
    write: () => {}
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, ["job-1"]);
});

test("runPlanningWorkerCli returns a usage error without a job id", async () => {
  const messages: string[] = [];
  const code = await runPlanningWorkerCli({
    argv: ["node", "planning-worker"],
    executeJob: async () => {
      throw new Error("should not run");
    },
    write: (message) => messages.push(message)
  });

  assert.equal(code, 1);
  assert.match(messages.join("\n"), /Usage/);
});

test("runPlanningWorkerCli handles planning job created event payloads", async () => {
  const messages: string[] = [];
  const calls: string[] = [];
  const code = await runPlanningWorkerCli({
    argv: [
      "node",
      "planning-worker",
      "--event",
      JSON.stringify({
        type: "planning.job.created",
        jobId: "job-2",
        requestedAt: "2026-05-08T10:00:00.000Z"
      })
    ],
    executeJob: async (id) => {
      calls.push(id);
      return planningJob(id, "completed");
    },
    write: (message) => messages.push(message)
  });

  assert.equal(code, 0);
  assert.deepEqual(calls, ["job-2"]);
  assert.match(messages.join("\n"), /Planning event job-2 processed/);
});
