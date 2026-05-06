import { generateRealRouteCard } from "@/domain/real-route-planner";
import { isRouteThemeId } from "@/domain/theme-catalog";
import type { CompanionType, RouteCardRequest, TransportPreference, TripPreferenceId } from "@/domain/types";
import { jsonError, jsonOk } from "@/server/api-response";

export const dynamic = "force-dynamic";

const allowedTripPreferences = new Set<TripPreferenceId>([
  "经典必玩",
  "吃喝逛",
  "亲子",
  "citywalk",
  "历史古迹",
  "小众探索",
  "拍照出片",
  "自然风光",
  "文艺展览",
  "室内备选",
  "少走路",
  "预算友好"
]);

const allowedTransportPreferences = new Set<TransportPreference>(["walk_first", "public_transit_ok", "taxi_ok"]);
const allowedCompanions = new Set<CompanionType>(["solo", "friends", "couple", "family", "elderly"]);
const maxImportedTextLength = 600;
const maxLocationTextLength = 80;

function asString(value: unknown): string {
  return String(value || "").trim();
}

function asCappedString(value: unknown, maxLength: number): string {
  return asString(value).slice(0, maxLength);
}

function asTripPreferences(value: unknown): TripPreferenceId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const preferences = value
    .map((item) => String(item).trim())
    .filter((item): item is TripPreferenceId => allowedTripPreferences.has(item as TripPreferenceId));
  return preferences.length ? Array.from(new Set(preferences)) : undefined;
}

function asTransportPreference(value: unknown): TransportPreference | undefined {
  const raw = asString(value);
  return allowedTransportPreferences.has(raw as TransportPreference) ? (raw as TransportPreference) : undefined;
}

function asCompanion(value: unknown): CompanionType | undefined {
  const raw = asString(value);
  return allowedCompanions.has(raw as CompanionType) ? (raw as CompanionType) : undefined;
}

export function asRequestBody(value: unknown): RouteCardRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const city = asString(body.city);
  const themeId = asString(body.themeId);
  const startDate = asString(body.startDate);
  const durationDays = Number(body.durationDays || 1);
  const note = asString(body.note);

  if (!city || !isRouteThemeId(themeId) || !startDate || (durationDays !== 1 && durationDays !== 2)) {
    return null;
  }

  const requestBody: RouteCardRequest = { city, themeId, startDate, durationDays, note };
  const tripPreferences = asTripPreferences(body.tripPreferences);
  const importedText = asCappedString(body.importedText, maxImportedTextLength);
  const startPoint = asCappedString(body.startPoint, maxLocationTextLength);
  const endPoint = asCappedString(body.endPoint, maxLocationTextLength);
  const transportPreference = asTransportPreference(body.transportPreference);
  const companion = asCompanion(body.companion);

  if (tripPreferences) requestBody.tripPreferences = tripPreferences;
  if (importedText) requestBody.importedText = importedText;
  if (startPoint) requestBody.startPoint = startPoint;
  if (endPoint) requestBody.endPoint = endPoint;
  if (transportPreference) requestBody.transportPreference = transportPreference;
  if (companion) requestBody.companion = companion;

  return requestBody;
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
