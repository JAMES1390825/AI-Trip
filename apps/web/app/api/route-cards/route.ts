import type { RouteCard } from "@/domain/types";
import { jsonError, jsonOk } from "@/server/api-response";
import { createRouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

const store = createRouteCardStore();

function isRouteCard(value: unknown): value is RouteCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<RouteCard>;
  return Boolean(card.id && card.city && card.title && Array.isArray(card.stops));
}

export async function GET(): Promise<Response> {
  return jsonOk({ items: await store.list() });
}

export async function POST(request: Request): Promise<Response> {
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
