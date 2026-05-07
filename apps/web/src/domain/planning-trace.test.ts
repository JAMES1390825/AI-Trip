import assert from "node:assert/strict";
import test from "node:test";
import {
  createQueuedPlanningTrace,
  markTraceNode,
  mergeCompletedPlanningTrace,
  planningTraceNodes
} from "./planning-trace";

test("createQueuedPlanningTrace returns all graph nodes as queued", () => {
  const trace = createQueuedPlanningTrace();

  assert.equal(trace.length, planningTraceNodes.length);
  assert.deepEqual(
    trace.map((event) => event.nodeId),
    planningTraceNodes.map((node) => node.id),
  );
  assert.ok(trace.every((event) => event.status === "queued"));
});

test("markTraceNode updates a single node status and detail", () => {
  const trace = createQueuedPlanningTrace();
  const next = markTraceNode(trace, "evidence_agent", "warning", "公开证据暂时不可用");

  const evidenceEvent = next.find((event) => event.nodeId === "evidence_agent");
  const poiEvent = next.find((event) => event.nodeId === "poi_search_agent");
  assert.equal(evidenceEvent?.status, "warning");
  assert.equal(evidenceEvent?.detail, "公开证据暂时不可用");
  assert.equal(poiEvent?.status, "queued");
  assert.notEqual(next, trace);
});

test("mergeCompletedPlanningTrace preserves completed labels and queues missing nodes", () => {
  const trace = markTraceNode(createQueuedPlanningTrace(), "intent_agent", "done", "已理解需求").filter(
    (event) => event.nodeId !== "composer",
  );
  const merged = mergeCompletedPlanningTrace(trace);

  assert.equal(merged.length, planningTraceNodes.length);
  assert.equal(merged.find((event) => event.nodeId === "intent_agent")?.detail, "已理解需求");
  assert.equal(merged.find((event) => event.nodeId === "composer")?.status, "queued");
});
