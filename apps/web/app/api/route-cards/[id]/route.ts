import { jsonError, jsonOk } from "@/server/api-response";
import { createRouteCardStore, type RouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export function createRouteCardDetailHandlers(store: RouteCardStore) {
  return {
    async GET(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      const routeCard = await store.get(id);
      if (!routeCard) return jsonError(404, "NOT_FOUND", "Route card not found.");
      return jsonOk({ routeCard });
    },
    async DELETE(_request: Request, context: RouteContext): Promise<Response> {
      const { id } = await context.params;
      const deleted = await store.delete(id);
      if (!deleted) return jsonError(404, "NOT_FOUND", "Route card not found.");
      return new Response(null, { status: 204 });
    }
  };
}

let defaultStore: RouteCardStore | undefined;

function getDefaultStore(): RouteCardStore {
  if (!defaultStore) defaultStore = createRouteCardStore();
  return defaultStore;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return createRouteCardDetailHandlers(getDefaultStore()).GET(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return createRouteCardDetailHandlers(getDefaultStore()).DELETE(request, context);
}
