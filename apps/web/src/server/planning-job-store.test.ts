import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaPlanningJobStore, type PlanningJobRow, type PlanningTraceEventRow } from "./planning-job-store";

class FakePlanningJobDelegate {
  public rows = new Map<string, PlanningJobRow>();
  public creates: unknown[] = [];

  async create(payload: {
    data: {
      tripId?: string;
      requestPayload: unknown;
      status?: string;
    };
  }): Promise<PlanningJobRow> {
    this.creates.push(payload);
    const now = new Date("2026-05-08T10:00:00.000Z");
    const row: PlanningJobRow = {
      id: `job-${this.rows.size + 1}`,
      tripId: payload.data.tripId || null,
      itineraryVersionId: null,
      status: payload.data.status || "queued",
      requestPayload: payload.data.requestPayload,
      resultPayload: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null
    };
    this.rows.set(row.id, row);
    return row;
  }

  async findUnique(payload: { where: { id: string } }): Promise<PlanningJobRow | null> {
    return this.rows.get(payload.where.id) || null;
  }

  async update(payload: {
    where: { id: string };
    data: Partial<PlanningJobRow>;
  }): Promise<PlanningJobRow> {
    const current = this.rows.get(payload.where.id);
    if (!current) throw new Error("not found");
    const row = { ...current, ...payload.data, updatedAt: new Date("2026-05-08T10:05:00.000Z") };
    this.rows.set(row.id, row);
    return row;
  }
}

class FakePlanningTraceEventDelegate {
  public rows: PlanningTraceEventRow[] = [];
  public creates: unknown[] = [];

  async createMany(payload: {
    data: Array<{
      planningJobId: string;
      nodeId: string;
      label: string;
      status: string;
      detail?: string;
      sequence: number;
      startedAt?: Date;
      finishedAt?: Date;
    }>;
    skipDuplicates?: boolean;
  }): Promise<{ count: number }> {
    this.creates.push(payload);
    const now = new Date("2026-05-08T10:06:00.000Z");
    for (const item of payload.data) {
      this.rows.push({
        id: `trace-${this.rows.length + 1}`,
        planningJobId: item.planningJobId,
        nodeId: item.nodeId,
        label: item.label,
        status: item.status,
        detail: item.detail || null,
        sequence: item.sequence,
        startedAt: item.startedAt || null,
        finishedAt: item.finishedAt || null,
        createdAt: now
      });
    }
    return { count: payload.data.length };
  }

  async findMany(payload: {
    where: { planningJobId: string };
    orderBy: { sequence: "asc" };
  }): Promise<PlanningTraceEventRow[]> {
    return this.rows
      .filter((row) => row.planningJobId === payload.where.planningJobId)
      .sort((left, right) => left.sequence - right.sequence);
  }
}

test("createPrismaPlanningJobStore creates queued planning jobs", async () => {
  const delegate = new FakePlanningJobDelegate();
  const store = createPrismaPlanningJobStore({ planningJob: delegate });

  const job = await store.create({
    tripId: "trip-1",
    requestPayload: {
      city: "杭州",
      startDate: "2026-05-10"
    }
  });

  assert.deepEqual(delegate.creates[0], {
    data: {
      tripId: "trip-1",
      requestPayload: {
        city: "杭州",
        startDate: "2026-05-10"
      },
      status: "queued"
    }
  });
  assert.deepEqual(job, {
    id: "job-1",
    tripId: "trip-1",
    status: "queued",
    requestPayload: {
      city: "杭州",
      startDate: "2026-05-10"
    },
    createdAt: "2026-05-08T10:00:00.000Z",
    updatedAt: "2026-05-08T10:00:00.000Z"
  });
});

test("createPrismaPlanningJobStore loads missing and existing jobs", async () => {
  const delegate = new FakePlanningJobDelegate();
  const store = createPrismaPlanningJobStore({ planningJob: delegate });

  const created = await store.create({
    requestPayload: {
      city: "上海"
    }
  });

  assert.equal(await store.get("missing"), null);
  assert.equal((await store.get(created.id))?.id, created.id);
});

test("createPrismaPlanningJobStore marks jobs running completed and failed", async () => {
  const delegate = new FakePlanningJobDelegate();
  const store = createPrismaPlanningJobStore({ planningJob: delegate });
  const created = await store.create({
    requestPayload: {
      city: "杭州"
    }
  });

  const running = await store.markRunning(created.id, new Date("2026-05-08T10:01:00.000Z"));
  assert.equal(running.status, "running");
  assert.equal(running.startedAt, "2026-05-08T10:01:00.000Z");

  const completed = await store.markCompleted(
    created.id,
    {
      routeCard: { id: "card-1" },
      planningTrace: []
    },
    new Date("2026-05-08T10:02:00.000Z"),
  );
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.resultPayload, {
    routeCard: { id: "card-1" },
    planningTrace: []
  });
  assert.equal(completed.finishedAt, "2026-05-08T10:02:00.000Z");

  const failed = await store.markFailed(created.id, "planner_error", new Date("2026-05-08T10:03:00.000Z"));
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "planner_error");
  assert.equal(failed.finishedAt, "2026-05-08T10:03:00.000Z");
});

test("createPrismaPlanningJobStore appends and lists ordered planning trace events", async () => {
  const planningJob = new FakePlanningJobDelegate();
  const planningTraceEvent = new FakePlanningTraceEventDelegate();
  const store = createPrismaPlanningJobStore({ planningJob, planningTraceEvent });

  await store.appendTraceEvents("job-1", [
    {
      nodeId: "intent_agent",
      label: "理解旅行需求",
      status: "done",
      detail: "想拍照，少走路",
      startedAt: "2026-05-08T10:01:00.000Z",
      finishedAt: "2026-05-08T10:01:01.000Z"
    },
    {
      nodeId: "poi_search_agent",
      label: "高德检索真实地点",
      status: "warning",
      detail: "真实地点候选不足"
    }
  ]);

  assert.deepEqual(planningTraceEvent.creates[0], {
    data: [
      {
        planningJobId: "job-1",
        nodeId: "intent_agent",
        label: "理解旅行需求",
        status: "done",
        detail: "想拍照，少走路",
        sequence: 0,
        startedAt: new Date("2026-05-08T10:01:00.000Z"),
        finishedAt: new Date("2026-05-08T10:01:01.000Z")
      },
      {
        planningJobId: "job-1",
        nodeId: "poi_search_agent",
        label: "高德检索真实地点",
        status: "warning",
        detail: "真实地点候选不足",
        sequence: 1,
        startedAt: undefined,
        finishedAt: undefined
      }
    ],
    skipDuplicates: true
  });

  const traceEvents = await store.listTraceEvents("job-1");
  assert.deepEqual(traceEvents, [
    {
      nodeId: "intent_agent",
      label: "理解旅行需求",
      status: "done",
      detail: "想拍照，少走路",
      startedAt: "2026-05-08T10:01:00.000Z",
      finishedAt: "2026-05-08T10:01:01.000Z"
    },
    {
      nodeId: "poi_search_agent",
      label: "高德检索真实地点",
      status: "warning",
      detail: "真实地点候选不足"
    }
  ]);
});
