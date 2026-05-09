import { generateGraphRouteCard, type TripPlanningGraphResult } from "@/domain/trip-planning-graph";
import type { PlanningTraceEvent, RouteCardRequest, RouteThemeId } from "@/domain/types";
import { isRouteThemeId } from "@/domain/theme-catalog";
import type { PlanningJobRecord, PlanningJobStore } from "./planning-job-store";

export type PlanningJobExecutor = {
  executeJob(id: string): Promise<PlanningJobRecord | null>;
};

export type PlanningJobExecutorOptions = {
  jobStore: PlanningJobStore;
  generateRoute?: (request: RouteCardRequest) => Promise<TripPlanningGraphResult>;
  now?: () => Date;
};

function asString(value: unknown): string {
  return String(value || "").trim();
}

function isDurationDays(value: unknown): value is 1 | 2 {
  return value === 1 || value === 2;
}

function failureTraceEvent(errorCode: string, at: Date): PlanningTraceEvent {
  const timestamp = at.toISOString();
  return {
    nodeId: "composer",
    label: "规划任务失败",
    status: "error",
    detail: errorCode,
    startedAt: timestamp,
    finishedAt: timestamp
  };
}

export function asRouteCardRequest(value: unknown): RouteCardRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const city = asString(body.city);
  const themeId = asString(body.themeId) as RouteThemeId;
  const startDate = asString(body.startDate);
  const durationDays = body.durationDays;
  if (!city || !isRouteThemeId(themeId) || !startDate || !isDurationDays(durationDays)) return null;

  return {
    ...(body as RouteCardRequest),
    city,
    themeId,
    startDate,
    durationDays,
    note: asString(body.note)
  };
}

export function createPlanningJobExecutor(options: PlanningJobExecutorOptions): PlanningJobExecutor {
  const generateRoute = options.generateRoute || generateGraphRouteCard;
  const now = options.now || (() => new Date());

  return {
    async executeJob(id) {
      const job = await options.jobStore.get(id);
      if (!job) return null;
      if (job.status === "completed" || job.status === "failed") return job;

      const request = asRouteCardRequest(job.requestPayload);
      if (!request) {
        const failedAt = now();
        await options.jobStore.appendTraceEvents(id, [failureTraceEvent("invalid_request_payload", failedAt)]);
        return options.jobStore.markFailed(id, "invalid_request_payload", failedAt);
      }

      await options.jobStore.markRunning(id, now());
      try {
        const result = await generateRoute(request);
        await options.jobStore.appendTraceEvents(id, result.planningTrace);
        return options.jobStore.markCompleted(
          id,
          {
            routeCard: result.routeCard,
            planningTrace: result.planningTrace
          },
          now(),
        );
      } catch {
        const failedAt = now();
        await options.jobStore.appendTraceEvents(id, [failureTraceEvent("planning_execution_failed", failedAt)]);
        return options.jobStore.markFailed(id, "planning_execution_failed", failedAt);
      }
    }
  };
}
