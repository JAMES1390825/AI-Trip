import { jsonError, jsonOk } from "@/server/api-response";
import { createRouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

const store = createRouteCardStore();

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const routeCard = await store.get(id);
  if (!routeCard) return jsonError(404, "NOT_FOUND", "Route card not found.");
  return jsonOk({ routeCard });
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const deleted = await store.delete(id);
  if (!deleted) return jsonError(404, "NOT_FOUND", "Route card not found.");
  return new Response(null, { status: 204 });
}
