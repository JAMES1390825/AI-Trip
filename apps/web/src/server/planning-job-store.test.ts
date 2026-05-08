import assert from "node:assert/strict";
import test from "node:test";
import { createPrismaPlanningJobStore, type PlanningJobRow } from "./planning-job-store";

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
