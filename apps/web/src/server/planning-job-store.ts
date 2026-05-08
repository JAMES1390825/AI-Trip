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
};

export type CreatePlanningJobInput = {
  tripId?: string;
  requestPayload: unknown;
};

export type PlanningJobStore = {
  create(input: CreatePlanningJobInput): Promise<PlanningJobRecord>;
  get(id: string): Promise<PlanningJobRecord | null>;
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
};

export type PrismaPlanningJobStoreClient = {
  planningJob: PlanningJobDelegate;
};

function optionalDate(value: Date | null): string | undefined {
  return value ? value.toISOString() : undefined;
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
    }
  };
}
