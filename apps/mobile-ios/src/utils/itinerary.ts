import type {
  ItineraryAlternative,
  ItineraryBlock,
  ItineraryCommunityBasis,
  ItineraryBlockEvidence,
  ItineraryDay,
  ItineraryDaySummary,
  ItineraryLeg,
  ItineraryPersonalizationBasis,
  ItineraryTodayHint,
  ItineraryView,
  ValidationResult,
} from "../types/itinerary";
import type { PlanningBrief } from "../types/plan";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseValidationResult(value: unknown): ValidationResult | null {
  const raw = asRecord(value);
  if (!Object.keys(raw).length) return null;
  const coverage = asRecord(raw.coverage);
  return {
    passed: Boolean(raw.passed),
    confidenceTier: asString(raw.confidence_tier),
    issues: asArray(raw.issues)
      .map((item) => {
        const issue = asRecord(item);
        return {
          code: asString(issue.code),
          message: asString(issue.message),
        };
      })
      .filter((item) => item.code || item.message),
    coverage: {
      providerGroundedBlocks: asNumber(coverage.provider_grounded_blocks),
      routeEvidenceCoverage: asNumber(coverage.route_evidence_coverage),
      weatherEvidenceCoverage: asNumber(coverage.weather_evidence_coverage),
      mustGoHitRate: asNumber(coverage.must_go_hit_rate),
    },
  };
}

function parsePlanningBrief(value: unknown): PlanningBrief | null {
  const raw = asRecord(value);
  if (!Object.keys(raw).length) return null;
  const destination = asRecord(raw.destination);
  const constraints = asRecord(raw.constraints);
  return {
    origin_city: asString(raw.origin_city),
    destination: Object.keys(destination).length
      ? {
          destination_id: asString(destination.destination_id),
          destination_label: asString(destination.destination_label),
          country: asString(destination.country),
          region: asString(destination.region),
          adcode: asString(destination.adcode),
          city_code: asString(destination.city_code),
          center_lat: asNumber(destination.center_lat),
          center_lng: asNumber(destination.center_lng),
          provider: asString(destination.provider),
          provider_place_id: asString(destination.provider_place_id),
          match_type: (asString(destination.match_type) || "city") as "city" | "district" | "poi" | "custom",
        }
      : null,
    days: asNumber(raw.days),
    start_date: asString(raw.start_date),
    budget_level: (asString(raw.budget_level) || "medium") as "low" | "medium" | "high",
    pace: (asString(raw.pace) || "relaxed") as "relaxed" | "compact",
    travel_styles: asArray(raw.travel_styles).map((item) => asString(item)).filter(Boolean),
    must_go: asArray(raw.must_go).map((item) => asString(item)).filter(Boolean),
    avoid: asArray(raw.avoid).map((item) => asString(item)).filter(Boolean),
    constraints: {
      weather_preference: asString(constraints.weather_preference),
      dining_preference: asString(constraints.dining_preference),
      lodging_anchor: asString(constraints.lodging_anchor),
    },
    missing_fields: asArray(raw.missing_fields).map((item) => asString(item)).filter(Boolean),
    ready_to_generate: Boolean(raw.ready_to_generate),
  };
}

function parseAlternatives(value: unknown): ItineraryAlternative[] {
  return asArray(value)
    .map((item) => {
      const alt = asRecord(item);
      return {
        poi: asString(alt.poi),
        poiLat: asNumber(alt.poi_lat),
        poiLon: asNumber(alt.poi_lon),
        mapUrl: asString(alt.poi_map_url),
        note: asString(alt.note),
      };
    })
    .filter((item) => item.poi.length > 0);
}

function parseBlockEvidence(value: unknown): ItineraryBlockEvidence | null {
  const raw = asRecord(value);
  if (!Object.keys(raw).length) return null;
  const scoreBreakdown = asRecord(raw.score_breakdown);
  return {
    routeMinutesFromPrev: asNumber(raw.route_minutes_from_prev),
    weatherBasis: asString(raw.weather_basis),
    openingBasis: asString(raw.opening_basis),
    scoreBreakdown: Object.keys(scoreBreakdown).reduce<Record<string, number>>((acc, key) => {
      acc[key] = asNumber(scoreBreakdown[key]);
      return acc;
    }, {}),
  };
}

function parseCommunityBasis(value: unknown): ItineraryCommunityBasis | null {
  const raw = asRecord(value);
  if (!Object.keys(raw).length) return null;
  return {
    matchedPlace: asString(raw.matched_place),
    matchedTags: asArray(raw.matched_tags).map((item) => asString(item)).filter(Boolean),
    sourcePostIds: asArray(raw.source_post_ids).map((item) => asString(item)).filter(Boolean),
    signalScore: asNumber(raw.signal_score),
    referenced: Boolean(raw.referenced),
  };
}

function parsePersonalizationBasis(value: unknown): ItineraryPersonalizationBasis | null {
  const raw = asRecord(value);
  if (!Object.keys(raw).length) return null;
  return {
    boost: asNumber(raw.boost),
    matchedCategories: asArray(raw.matched_categories).map((item) => asString(item)).filter(Boolean),
    matchedTags: asArray(raw.matched_tags).map((item) => asString(item)).filter(Boolean),
    districtAdcode: asString(raw.district_adcode),
    confidence: asNumber(raw.confidence),
  };
}

function hasValidCoord(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0);
}

export function extractPrimaryItinerary(payload: Record<string, unknown>): Record<string, unknown> {
  const plans = asArray(payload.plans);
  if (plans.length > 0) {
    const first = asRecord(plans[0]);
    const itinerary = asRecord(first.itinerary);
    if (Object.keys(itinerary).length > 0) return itinerary;
  }
  return payload;
}

export function toItineraryView(raw: Record<string, unknown> | null): ItineraryView | null {
  if (!raw) return null;

  const dayItems = asArray(raw.days);
  const days: ItineraryDay[] = dayItems.map((item, idx) => {
    const day = asRecord(item);
    const blockItems = asArray(day.blocks);
    const blocks: ItineraryBlock[] = blockItems.map((blockItem, blockIdx) => {
      const block = asRecord(blockItem);
      const reason = asRecord(block.reason);
      return {
        blockId: asString(block.block_id) || `d${idx + 1}-b${blockIdx + 1}`,
        dayIndex: Number.isInteger(asNumber(block.day_index)) ? asNumber(block.day_index) : idx,
        startHour: asNumber(block.start_hour),
        endHour: asNumber(block.end_hour),
        title: asString(block.title),
        blockType: asString(block.block_type),
        poi: asString(block.poi),
        reasonNote: asString(reason.note),
        recommendReason: asString(block.recommend_reason) || asString(reason.note),
        weatherRisk: asString(block.weather_risk),
        riskLevel: asString(block.risk_level),
        alternatives: parseAlternatives(block.alternatives),
        poiLat: asNumber(block.poi_lat),
        poiLon: asNumber(block.poi_lon),
        mapUrl: asString(block.poi_map_url),
        poiTags: asArray(block.poi_tags).map((item) => asString(item)).filter(Boolean),
        poiAddress: asString(block.poi_address),
        poiRating: asNumber(block.poi_rating),
        provider: asString(block.provider),
        providerPlaceId: asString(block.provider_place_id),
        sourceMode: asString(block.source_mode),
        sourceFetchedAt: asString(block.source_fetched_at),
        confidenceTier: asString(block.confidence_tier),
        locked: Boolean(block.locked),
        lockReason: asString(block.lock_reason),
        evidence: parseBlockEvidence(block.evidence),
        communityBasis: parseCommunityBasis(block.community_basis),
        personalizationBasis: parsePersonalizationBasis(block.personalization_basis),
      };
    });
    return {
      dayIndex: Number.isInteger(asNumber(day.day_index)) ? asNumber(day.day_index) : idx,
      date: asString(day.date),
      blocks,
    };
  });

  const legItems = asArray(raw.transit_legs);
  const legs: ItineraryLeg[] = legItems
    .map((item) => {
      const leg = asRecord(item);
      return {
        dayIndex: asNumber(leg.day_index),
        fromPoi: asString(leg.from_poi),
        toPoi: asString(leg.to_poi),
        fromLat: asNumber(leg.from_lat),
        fromLon: asNumber(leg.from_lon),
        toLat: asNumber(leg.to_lat),
        toLon: asNumber(leg.to_lon),
        mode: asString(leg.mode),
        minutes: asNumber(leg.minutes),
        provider: asString(leg.provider),
        sourceMode: asString(leg.source_mode),
        sourceFetchedAt: asString(leg.source_fetched_at),
      };
    })
    .filter((item) => hasValidCoord(item.fromLat, item.fromLon) && hasValidCoord(item.toLat, item.toLon));

  const daySummaryItems = asArray(raw.day_summaries);
  const daySummaries: ItineraryDaySummary[] = daySummaryItems.map((item, idx) => {
    const summary = asRecord(item);
    return {
      dayIndex: Number.isInteger(asNumber(summary.day_index)) ? asNumber(summary.day_index) : idx,
      date: asString(summary.date),
      title: asString(summary.title),
      preview: asString(summary.preview),
      poiCount: asNumber(summary.poi_count),
      transitMinutes: asNumber(summary.transit_minutes),
      recommendedMode: asString(summary.recommended_mode),
    };
  });

  const todayHintRaw = asRecord(raw.today_hint);
  const todayHint: ItineraryTodayHint | null = Object.keys(todayHintRaw).length
    ? {
        dayIndex: asNumber(todayHintRaw.day_index),
        date: asString(todayHintRaw.date),
        title: asString(todayHintRaw.title),
        nextPoi: asString(todayHintRaw.next_poi),
      }
    : null;

  return {
    destination: asString(raw.destination),
    startDate: asString(raw.start_date),
    confidence: asNumber(raw.confidence),
    estimatedCost: asNumber(raw.estimated_cost),
    mapProvider: asString(raw.map_provider),
    sourceMode: asString(raw.source_mode),
    degraded: Boolean(raw.degraded),
    degradedReason: asString(raw.degraded_reason),
    validationResult: parseValidationResult(raw.validation_result),
    communityReferenceSummary: Object.keys(asRecord(raw.community_reference_summary)).length ? asRecord(raw.community_reference_summary) : null,
    personalizationSummary: Object.keys(asRecord(raw.personalization_summary)).length ? asRecord(raw.personalization_summary) : null,
    warnings: asArray(raw.warnings).map((item) => asString(item)).filter(Boolean),
    planningBrief: parsePlanningBrief(raw.planning_brief),
    days,
    legs,
    daySummaries,
    todayHint,
  };
}

export function formatHourRange(startHour: number, endHour: number): string {
  const start = Number.isFinite(startHour) ? Math.max(0, Math.floor(startHour)) : 0;
  const end = Number.isFinite(endHour) ? Math.max(0, Math.floor(endHour)) : 0;
  return `${String(start).padStart(2, "0")}:00 - ${String(end).padStart(2, "0")}:00`;
}

export function blockTypeLabel(blockType: string): string {
  switch (blockType) {
    case "sight":
      return "景点";
    case "food":
      return "用餐";
    case "experience":
      return "体验";
    case "night":
      return "夜游";
    default:
      return "行程";
  }
}

export function groupDayLabel(dayIndex: number): string {
  return `第${dayIndex + 1}天`;
}

export function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

export function blockHasCoord(block: ItineraryBlock): boolean {
  return hasValidCoord(block.poiLat, block.poiLon);
}
