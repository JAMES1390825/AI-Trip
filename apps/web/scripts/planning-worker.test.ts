import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningJobRecord } from "../src/server/planning-job-store";
import { installPlanningWorkerSignalHandlers, runPlanningWorkerCli } from "./planning-worker";

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

test("runPlanningWorkerCli starts a bounded RocketMQ daemon loop", async () => {
  const messages: string[] = [];
  const daemonOptions: unknown[] = [];
  const code = await runPlanningWorkerCli({
    argv: ["node", "planning-worker", "--daemon", "--max-batches", "2"],
    executeJob: async () => {
      throw new Error("should not execute a direct job in daemon mode");
    },
    runDaemon: async (options) => {
      daemonOptions.push(options);
      return {
        batches: 2,
        received: 3,
        acknowledged: 2,
        failed: 1
      };
    },
    write: (message) => messages.push(message)
  });

  assert.equal(code, 2);
  assert.deepEqual(daemonOptions, [{ maxBatches: 2 }]);
  assert.match(messages.join("\n"), /Planning daemon starting/);
  assert.match(messages.join("\n"), /Planning daemon stopped: 2 batches, 3 received, 2 acknowledged, 1 failed/);
});

test("runPlanningWorkerCli rejects invalid daemon max batches", async () => {
  const messages: string[] = [];
  const code = await runPlanningWorkerCli({
    argv: ["node", "planning-worker", "--daemon", "--max-batches", "0"],
    executeJob: async () => {
      throw new Error("should not execute");
    },
    runDaemon: async () => {
      throw new Error("should not start daemon");
    },
    write: (message) => messages.push(message)
  });

  assert.equal(code, 1);
  assert.match(messages.join("\n"), /--max-batches must be a positive integer/);
});

test("installPlanningWorkerSignalHandlers stops the daemon on process termination", async () => {
  const handlers = new Map<string, () => void>();
  let stopCalls = 0;
  const cleanup = installPlanningWorkerSignalHandlers(
    {
      async stop() {
        stopCalls += 1;
      }
    },
    {
      once(signal, handler) {
        handlers.set(signal, handler);
      },
      off(signal) {
        handlers.delete(signal);
      }
    },
  );

  handlers.get("SIGTERM")?.();
  await Promise.resolve();

  assert.equal(stopCalls, 1);
  cleanup();
  assert.deepEqual([...handlers.keys()], []);
});
