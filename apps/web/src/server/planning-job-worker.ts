import type { PlanningJobRecord } from "./planning-job-store";
import type { PlanningJobService } from "./planning-job-service";
import type { PlanningJobCreatedEvent } from "./planning-queue";

export type PlanningJobWorkerResult =
  | { status: "processed"; jobId: string; jobStatus: PlanningJobRecord["status"] }
  | { status: "failed"; jobId: string; errorCode: string }
  | { status: "not_found"; jobId: string }
  | { status: "ignored"; reason: "invalid_event" };

export type PlanningJobWorker = {
  handleEvent(eventBody: unknown): Promise<PlanningJobWorkerResult>;
};

export type PlanningJobWorkerOptions = {
  service: PlanningJobService;
};

function parseEventBody(eventBody: unknown): unknown {
  if (Buffer.isBuffer(eventBody)) return JSON.parse(eventBody.toString("utf8"));
  if (typeof eventBody === "string") return JSON.parse(eventBody);
  return eventBody;
}

export function parsePlanningJobCreatedEvent(eventBody: unknown): PlanningJobCreatedEvent | null {
  try {
    const value = parseEventBody(eventBody);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const event = value as Partial<PlanningJobCreatedEvent>;
    if (event.type !== "planning.job.created") return null;
    if (!String(event.jobId || "").trim()) return null;
    if (!String(event.requestedAt || "").trim()) return null;
    return {
      type: "planning.job.created",
      jobId: String(event.jobId).trim(),
      ...(event.tripId ? { tripId: String(event.tripId).trim() } : {}),
      ...(event.idempotencyKey ? { idempotencyKey: String(event.idempotencyKey).trim() } : {}),
      requestedAt: String(event.requestedAt).trim()
    };
  } catch {
    return null;
  }
}

export function createPlanningJobWorker(options: PlanningJobWorkerOptions): PlanningJobWorker {
  return {
    async handleEvent(eventBody) {
      const event = parsePlanningJobCreatedEvent(eventBody);
      if (!event) return { status: "ignored", reason: "invalid_event" };

      const job = await options.service.runJob(event.jobId);
      if (!job) return { status: "not_found", jobId: event.jobId };
      if (job.status === "failed") {
        return {
          status: "failed",
          jobId: event.jobId,
          errorCode: job.errorCode || "planning_execution_failed"
        };
      }
      return {
        status: "processed",
        jobId: event.jobId,
        jobStatus: job.status
      };
    }
  };
}
