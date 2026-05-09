import type { PlanningQueue } from "./planning-queue";
import { createRocketMqPlanningQueue, createRocketMqProducerFromEnv } from "./planning-queue";
import { createPlanningJobExecutor } from "./planning-job-executor";
import type { PlanningJobRecord, PlanningJobStore, PrismaPlanningJobStoreClient } from "./planning-job-store";
import { createPrismaPlanningJobStore } from "./planning-job-store";
import { readProductionEnv } from "./production-env";

export type CreatePlanningJobRequest = {
  tripId?: string;
  idempotencyKey?: string;
  requestPayload: unknown;
};

export type CreatePlanningJobResult = {
  job: PlanningJobRecord;
  queueMessageId?: string;
  queueWarning?: "planning_queue_unavailable";
};

export type PlanningJobService = {
  createJob(request: CreatePlanningJobRequest): Promise<CreatePlanningJobResult>;
  getJob(id: string): Promise<PlanningJobRecord | null>;
  runJob(id: string): Promise<PlanningJobRecord | null>;
};

export type PlanningJobRunner = {
  executeJob(id: string): Promise<PlanningJobRecord | null>;
};

export type PlanningJobServiceOptions = {
  jobStore: PlanningJobStore;
  planningQueue: PlanningQueue;
  runner?: PlanningJobRunner;
  now?: () => Date;
};

export function createPlanningJobService(options: PlanningJobServiceOptions): PlanningJobService {
  const now = options.now || (() => new Date());
  const runner = options.runner || createPlanningJobExecutor({ jobStore: options.jobStore });
  async function withTraceEvents(job: PlanningJobRecord | null): Promise<PlanningJobRecord | null> {
    if (!job) return null;
    const traceEvents = await options.jobStore.listTraceEvents(job.id);
    return traceEvents.length ? { ...job, traceEvents } : job;
  }

  return {
    async createJob(request) {
      const job = await options.jobStore.create({
        tripId: request.tripId,
        requestPayload: request.requestPayload
      });

      try {
        const queueMessageId = await options.planningQueue.publishPlanningJobCreated({
          type: "planning.job.created",
          jobId: job.id,
          tripId: request.tripId,
          idempotencyKey: request.idempotencyKey,
          requestedAt: now().toISOString()
        });
        return { job, queueMessageId };
      } catch {
        return { job, queueWarning: "planning_queue_unavailable" };
      }
    },
    async getJob(id) {
      return withTraceEvents(await options.jobStore.get(id));
    },
    async runJob(id) {
      return withTraceEvents(await runner.executeJob(id));
    }
  };
}

export function createDefaultPlanningJobService(): PlanningJobService {
  const { getPrismaClient } = require("./prisma-client") as typeof import("./prisma-client");
  const env = readProductionEnv();
  return createPlanningJobService({
    jobStore: createPrismaPlanningJobStore(getPrismaClient() as unknown as PrismaPlanningJobStoreClient),
    planningQueue: createRocketMqPlanningQueue(createRocketMqProducerFromEnv(env), {
      topicPlanning: env.rocketmq.topicPlanning
    })
  });
}
