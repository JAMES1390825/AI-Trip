import assert from "node:assert/strict";
import test from "node:test";
import { runPlanningWorkerCli } from "./planning-worker";

test("runPlanningWorkerCli executes the requested planning job id", async () => {
  const calls: string[] = [];
  const code = await runPlanningWorkerCli({
    argv: ["node", "planning-worker", "job-1"],
    executeJob: async (id) => {
      calls.push(id);
      return { status: "completed" };
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
