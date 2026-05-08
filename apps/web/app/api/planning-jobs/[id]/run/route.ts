import { jsonError, jsonOk } from "@/server/api-response";
import { createDefaultPlanningJobService, type PlanningJobService } from "@/server/planning-job-service";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export function createPlanningJobRunHandlers(service: PlanningJobService) {
  return {
    async POST(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      const job = await service.runJob(id);
      if (!job) return jsonError(404, "NOT_FOUND", "Planning job not found.");
      return jsonOk({ job });
    }
  };
}

let defaultService: PlanningJobService | undefined;

function getDefaultPlanningJobService(): PlanningJobService {
  if (!defaultService) defaultService = createDefaultPlanningJobService();
  return defaultService;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return createPlanningJobRunHandlers(getDefaultPlanningJobService()).POST(request, context);
}
