import type { PlanningBrief } from "./plan";

export type ValidationIssue = {
  code: string;
  message: string;
};

export type ValidationCoverage = {
  providerGroundedBlocks: number;
  routeEvidenceCoverage: number;
  weatherEvidenceCoverage: number;
  mustGoHitRate: number;
};

export type ValidationResult = {
  passed: boolean;
  confidenceTier: string;
  issues: ValidationIssue[];
  coverage: ValidationCoverage;
};

export type ItineraryAlternative = {
  poi: string;
  poiLat: number;
  poiLon: number;
  mapUrl: string;
  note: string;
};

export type ItineraryCommunityBasis = {
  matchedPlace: string;
  matchedTags: string[];
  sourcePostIds: string[];
  signalScore: number;
  referenced: boolean;
};

export type ItineraryPersonalizationBasis = {
  boost: number;
  matchedCategories: string[];
  matchedTags: string[];
  districtAdcode: string;
  confidence: number;
};

export type ItineraryBlockEvidence = {
  routeMinutesFromPrev: number;
  weatherBasis: string;
  openingBasis: string;
  scoreBreakdown: Record<string, number>;
};

export type ItineraryBlock = {
  blockId: string;
  dayIndex: number;
  startHour: number;
  endHour: number;
  title: string;
  blockType: string;
  poi: string;
  reasonNote: string;
  recommendReason: string;
  weatherRisk: string;
  riskLevel: string;
  alternatives: ItineraryAlternative[];
  poiLat: number;
  poiLon: number;
  mapUrl: string;
  poiTags: string[];
  poiAddress: string;
  poiRating: number;
  provider: string;
  providerPlaceId: string;
  sourceMode: string;
  sourceFetchedAt: string;
  confidenceTier: string;
  locked: boolean;
  lockReason: string;
  evidence: ItineraryBlockEvidence | null;
  communityBasis: ItineraryCommunityBasis | null;
  personalizationBasis: ItineraryPersonalizationBasis | null;
};

export type ItineraryDay = {
  dayIndex: number;
  date: string;
  blocks: ItineraryBlock[];
};

export type ItineraryLeg = {
  dayIndex: number;
  fromPoi: string;
  toPoi: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  mode: string;
  minutes: number;
  provider: string;
  sourceMode: string;
  sourceFetchedAt: string;
};

export type ItineraryDaySummary = {
  dayIndex: number;
  date: string;
  title: string;
  preview: string;
  poiCount: number;
  transitMinutes: number;
  recommendedMode: string;
};

export type ItineraryTodayHint = {
  dayIndex: number;
  date: string;
  title: string;
  nextPoi: string;
};

export type ItineraryView = {
  destination: string;
  startDate: string;
  confidence: number;
  estimatedCost: number;
  mapProvider: string;
  sourceMode: string;
  degraded: boolean;
  degradedReason: string;
  validationResult: ValidationResult | null;
  communityReferenceSummary: Record<string, unknown> | null;
  personalizationSummary: Record<string, unknown> | null;
  warnings: string[];
  planningBrief: PlanningBrief | null;
  days: ItineraryDay[];
  legs: ItineraryLeg[];
  daySummaries: ItineraryDaySummary[];
  todayHint: ItineraryTodayHint | null;
};
