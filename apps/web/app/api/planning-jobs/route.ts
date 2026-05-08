import { jsonError, jsonOk } from "@/server/api-response";
import { createDefaultPlanningJobService, type PlanningJobService } from "@/server/planning-job-service";

export const dynamic = "force-dynamic";

type PlanningJobRequestBody = {
  tripId?: string;
  request?: unknown;
  runImmediately?: unknown;
};

function asTrimmedString(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text || undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function createPlanningJobsHandlers(service: PlanningJobService) {
  return {
    async POST(request: Request): Promise<Response> {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return jsonError(400, "BAD_REQUEST", "Request body must be valid JSON.");
      }

      if (!isObject(raw)) {
        return jsonError(400, "BAD_REQUEST", "request is required.");
      }

      const body = raw as PlanningJobRequestBody;
      if (!isObject(body.request)) {
        return jsonError(400, "BAD_REQUEST", "request is required.");
      }

      const result = await service.createJob({
        tripId: asTrimmedString(body.tripId),
        idempotencyKey: asTrimmedString(request.headers.get("Idempotency-Key")),
        requestPayload: body.request
      });

      if (body.runImmediately === true) {
        const job = await service.runJob(result.job.id);
        return jsonOk({ ...result, job: job || result.job }, 202);
      }

      return jsonOk(result, 202);
    }
  };
}

let defaultService: PlanningJobService | undefined;

function getDefaultPlanningJobService(): PlanningJobService {
  if (!defaultService) defaultService = createDefaultPlanningJobService();
  return defaultService;
}

export async function POST(request: Request): Promise<Response> {
  return createPlanningJobsHandlers(getDefaultPlanningJobService()).POST(request);
}
