import type { RouteCard } from "@/domain/types";
import { jsonError, jsonOk } from "@/server/api-response";
import { createRouteCardStore, type RouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

function isRouteCard(value: unknown): value is RouteCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<RouteCard>;
  return Boolean(card.id && card.city && card.title && Array.isArray(card.stops));
}

export function createRouteCardHandlers(store: RouteCardStore) {
  return {
    async GET(): Promise<Response> {
      return jsonOk({ items: await store.list() });
    },
    async POST(request: Request): Promise<Response> {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return jsonError(400, "BAD_REQUEST", "Request body must be valid JSON.");
      }

      const routeCard = (raw as { routeCard?: unknown }).routeCard;
      if (!isRouteCard(routeCard)) {
        return jsonError(400, "BAD_REQUEST", "routeCard is required.");
      }

      return jsonOk({ routeCard: await store.save(routeCard) }, 201);
    }
  };
}

let defaultStore: RouteCardStore | undefined;

function getDefaultStore(): RouteCardStore {
  if (!defaultStore) defaultStore = createRouteCardStore();
  return defaultStore;
}

export async function GET(): Promise<Response> {
  return createRouteCardHandlers(getDefaultStore()).GET();
}

export async function POST(request: Request): Promise<Response> {
  return createRouteCardHandlers(getDefaultStore()).POST(request);
}
