import type { PlanningTraceEvent, PlanningTraceNodeId, PlanningTraceStatus } from "@/domain/types";

export type PlanningJobStatus = "queued" | "running" | "completed" | "failed";

export type PlanningJobRecord = {
  id: string;
  tripId?: string;
  itineraryVersionId?: string;
  status: PlanningJobStatus;
  requestPayload: unknown;
  resultPayload?: unknown;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  traceEvents?: PlanningTraceEvent[];
};

export type CreatePlanningJobInput = {
  tripId?: string;
  requestPayload: unknown;
};

export type PlanningJobStore = {
  create(input: CreatePlanningJobInput): Promise<PlanningJobRecord>;
  get(id: string): Promise<PlanningJobRecord | null>;
  markRunning(id: string, startedAt: Date): Promise<PlanningJobRecord>;
  markCompleted(id: string, resultPayload: unknown, finishedAt: Date): Promise<PlanningJobRecord>;
  markFailed(id: string, errorCode: string, finishedAt: Date): Promise<PlanningJobRecord>;
  appendTraceEvents(id: string, traceEvents: PlanningTraceEvent[]): Promise<void>;
  listTraceEvents(id: string): Promise<PlanningTraceEvent[]>;
};

export type PlanningJobRow = {
  id: string;
  tripId: string | null;
  itineraryVersionId: string | null;
  status: string;
  requestPayload: unknown;
  resultPayload: unknown | null;
  errorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type PlanningJobDelegate = {
  create(payload: {
    data: {
      tripId?: string;
      requestPayload: unknown;
      status?: string;
    };
  }): Promise<PlanningJobRow>;
  findUnique(payload: { where: { id: string } }): Promise<PlanningJobRow | null>;
  update(payload: {
    where: { id: string };
    data: {
      status?: string;
      resultPayload?: unknown;
      errorCode?: string | null;
      startedAt?: Date;
      finishedAt?: Date;
    };
  }): Promise<PlanningJobRow>;
};

export type PlanningTraceEventRow = {
  id: string;
  planningJobId: string;
  nodeId: string;
  label: string;
  status: string;
  detail: string | null;
  sequence: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

type PlanningTraceEventDelegate = {
  createMany(payload: {
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
  }): Promise<{ count: number }>;
  findMany(payload: {
    where: { planningJobId: string };
    orderBy: { sequence: "asc" };
  }): Promise<PlanningTraceEventRow[]>;
};

export type PrismaPlanningJobStoreClient = {
  planningJob: PlanningJobDelegate;
  planningTraceEvent?: PlanningTraceEventDelegate;
};

function optionalDate(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
}

function parseOptionalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toPlanningJobRecord(row: PlanningJobRow): PlanningJobRecord {
  const record: PlanningJobRecord = {
    id: row.id,
    status: row.status as PlanningJobStatus,
    requestPayload: row.requestPayload,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };

  if (row.tripId) record.tripId = row.tripId;
  if (row.itineraryVersionId) record.itineraryVersionId = row.itineraryVersionId;
  if (row.resultPayload !== null) record.resultPayload = row.resultPayload;
  if (row.errorCode) record.errorCode = row.errorCode;
  const startedAt = optionalDate(row.startedAt);
  const finishedAt = optionalDate(row.finishedAt);
  if (startedAt) record.startedAt = startedAt;
  if (finishedAt) record.finishedAt = finishedAt;
  return record;
}

function toPlanningTraceEvent(row: PlanningTraceEventRow): PlanningTraceEvent {
  const event: PlanningTraceEvent = {
    nodeId: row.nodeId as PlanningTraceNodeId,
    label: row.label,
    status: row.status as PlanningTraceStatus
  };
  if (row.detail) event.detail = row.detail;
  const startedAt = optionalDate(row.startedAt);
  const finishedAt = optionalDate(row.finishedAt);
  if (startedAt) event.startedAt = startedAt;
  if (finishedAt) event.finishedAt = finishedAt;
  return event;
}

export function createPrismaPlanningJobStore(client: PrismaPlanningJobStoreClient): PlanningJobStore {
  return {
    async create(input) {
      const row = await client.planningJob.create({
        data: {
          tripId: input.tripId,
          requestPayload: input.requestPayload,
          status: "queued"
        }
      });
      return toPlanningJobRecord(row);
    },
    async get(id) {
      const row = await client.planningJob.findUnique({ where: { id } });
      return row ? toPlanningJobRecord(row) : null;
    },
    async markRunning(id, startedAt) {
      const row = await client.planningJob.update({
        where: { id },
        data: {
          status: "running",
          startedAt,
          errorCode: null
        }
      });
      return toPlanningJobRecord(row);
    },
    async markCompleted(id, resultPayload, finishedAt) {
      const row = await client.planningJob.update({
        where: { id },
        data: {
          status: "completed",
          resultPayload,
          finishedAt,
          errorCode: null
        }
      });
      return toPlanningJobRecord(row);
    },
    async markFailed(id, errorCode, finishedAt) {
      const row = await client.planningJob.update({
        where: { id },
        data: {
          status: "failed",
          errorCode,
          finishedAt
        }
      });
      return toPlanningJobRecord(row);
    },
    async appendTraceEvents(id, traceEvents) {
      if (!client.planningTraceEvent || traceEvents.length === 0) return;
      await client.planningTraceEvent.createMany({
        data: traceEvents.map((event, index) => ({
          planningJobId: id,
          nodeId: event.nodeId,
          label: event.label,
          status: event.status,
          detail: event.detail,
          sequence: index,
          startedAt: parseOptionalDate(event.startedAt),
          finishedAt: parseOptionalDate(event.finishedAt)
        })),
        skipDuplicates: true
      });
    },
    async listTraceEvents(id) {
      if (!client.planningTraceEvent) return [];
      const rows = await client.planningTraceEvent.findMany({
        where: { planningJobId: id },
        orderBy: { sequence: "asc" }
      });
      return rows.map(toPlanningTraceEvent);
    }
  };
}
