import { generateRealRouteCard } from "@/domain/real-route-planner";
import { isRouteThemeId } from "@/domain/theme-catalog";
import type { RouteCardRequest } from "@/domain/types";
import { jsonError, jsonOk } from "@/server/api-response";

export const dynamic = "force-dynamic";

function asRequestBody(value: unknown): RouteCardRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const city = String(body.city || "").trim();
  const themeId = String(body.themeId || "").trim();
  const startDate = String(body.startDate || "").trim();
  const durationDays = Number(body.durationDays || 1);
  const note = String(body.note || "").trim();

  if (!city || !isRouteThemeId(themeId) || !startDate || (durationDays !== 1 && durationDays !== 2)) {
    return null;
  }

  return { city, themeId, startDate, durationDays, note };
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }

  const body = asRequestBody(raw);
  if (!body) {
    return jsonError(400, "BAD_REQUEST", "city, themeId, startDate, and durationDays are required.");
  }

  return jsonOk({ routeCard: await generateRealRouteCard(body) });
}
