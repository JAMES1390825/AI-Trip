import { reviseRouteCard } from "@/domain/route-revision";
import { isRouteThemeId } from "@/domain/theme-catalog";
import type { RouteCard } from "@/domain/types";
import { jsonError, jsonOk } from "@/server/api-response";
import { loadRootEnv } from "@/server/root-env";

export const dynamic = "force-dynamic";

type ReviseRequestBody = {
  routeCard: RouteCard;
  reviseNote: string;
};

function asRouteCard(value: unknown): RouteCard | null {
  if (!value || typeof value !== "object") return null;
  const card = value as RouteCard;
  if (!card.id || !card.city || !isRouteThemeId(card.themeId) || !card.startDate) return null;
  if (card.durationDays !== 1 && card.durationDays !== 2) return null;
  if (!Array.isArray(card.stops) || card.stops.length < 1) return null;
  return card;
}

function asRequestBody(value: unknown): ReviseRequestBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const routeCard = asRouteCard(body.routeCard);
  const reviseNote = String(body.reviseNote || "").trim();
  if (!routeCard || !reviseNote) return null;
  return { routeCard, reviseNote };
}

export async function POST(request: Request): Promise<Response> {
  loadRootEnv();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }

  const body = asRequestBody(raw);
  if (!body) {
    return jsonError(400, "BAD_REQUEST", "routeCard and reviseNote are required.");
  }

  return jsonOk({ routeCard: await reviseRouteCard(body) });
}
