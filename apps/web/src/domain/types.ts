export type RouteThemeId =
  | "classic"
  | "easy_citywalk"
  | "rain_backup"
  | "food_linked"
  | "night_half_day"
  | "low_budget";

export type SourceMode = "fallback" | "provider" | "mixed";

export type ConfidenceTier = "high" | "medium" | "needs_confirmation";

export type PlanningMode = "ai_amap" | "rule_amap" | "fallback_seed";

export type PlanningTraceNodeId =
  | "intent_agent"
  | "research_planner"
  | "poi_search_agent"
  | "evidence_agent"
  | "route_architect_agent"
  | "critic_agent"
  | "repair_agent"
  | "pretrip_agent"
  | "composer";

export type PlanningTraceStatus = "queued" | "active" | "done" | "warning" | "error";

export type PlanningTraceEvent = {
  nodeId: PlanningTraceNodeId;
  label: string;
  status: PlanningTraceStatus;
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type PretripChecklistCategory = "time" | "weather" | "traffic" | "booking" | "budget" | "comfort";

export type PretripChecklistSeverity = "info" | "warning" | "critical";

export type EvidenceUseCase = "reason" | "risk" | "season" | "reservation" | "context";

export type StopEvidence = {
  stopId?: string;
  title: string;
  url: string;
  sourceName: string;
  snippet: string;
  usedFor: EvidenceUseCase;
  publishedDate?: string;
};

export type PretripChecklistItem = {
  id: string;
  category: PretripChecklistCategory;
  title: string;
  detail: string;
  severity: PretripChecklistSeverity;
  actionLabel: string;
  relatedStopId?: string;
};

export type RouteQualitySummary = {
  matchScore: number;
  satisfied: string[];
  tradeoffs: string[];
  confirmationNeeded: string[];
  providerHealth: string[];
};

export type RouteTheme = {
  id: RouteThemeId;
  label: string;
  promise: string;
  primaryTags: string[];
  styleTags: string[];
  avoidTags: string[];
  defaultDurationDays: 1 | 2;
};

export type TripPreferenceId =
  | "经典必玩"
  | "吃喝逛"
  | "亲子"
  | "citywalk"
  | "历史古迹"
  | "小众探索"
  | "拍照出片"
  | "自然风光"
  | "文艺展览"
  | "室内备选"
  | "少走路"
  | "预算友好";

export type TransportPreference = "walk_first" | "public_transit_ok" | "taxi_ok";

export type CompanionType = "solo" | "friends" | "couple" | "family" | "elderly";

export type BudgetRange = "budget_friendly" | "balanced" | "flexible";

export type TripImportDraft = {
  rawText: string;
  cityHint?: string;
  placeNames: string[];
  mustVisitText?: string;
  avoidText?: string;
  noteHint?: string;
  preferenceHints: TripPreferenceId[];
  startPointHint?: string;
  endPointHint?: string;
  confidence: number;
  parseNotes: string[];
};

export type RouteCardRequest = {
  city: string;
  themeId: RouteThemeId;
  startDate: string;
  endDate?: string;
  durationDays: 1 | 2;
  note: string;
  routeSeed?: string;
  planningContext?: string;
  tripPreferences?: TripPreferenceId[];
  importedText?: string;
  startPoint?: string;
  endPoint?: string;
  transportPreference?: TransportPreference;
  companion?: CompanionType;
  budgetRange?: BudgetRange;
  mustVisitText?: string;
  avoidText?: string;
};

export type PoiSeed = {
  id: string;
  city: string;
  name: string;
  tags: string[];
  lat: number;
  lng: number;
  costLevel: 1 | 2 | 3;
  indoor: boolean;
  openingHours: string;
};

export type RouteStop = {
  id: string;
  time: string;
  poiId: string;
  providerPoiId?: string;
  poi: string;
  address?: string;
  providerType?: string;
  day?: 1 | 2;
  tags: string[];
  lat: number;
  lng: number;
  mapUrl: string;
  reason: string;
  risk: string;
  sourceMode: SourceMode;
};

export type RouteLeg = {
  fromPoi: string;
  toPoi: string;
  minutes: number;
  degraded?: boolean;
  sourceMode: SourceMode;
};

export type ShareCopy = {
  posterTitle: string;
  posterSubtitle: string;
  storyTitle: string;
  storyCaption: string;
};

export type RouteCard = {
  id: string;
  city: string;
  themeId: RouteThemeId;
  themeLabel: string;
  title: string;
  summary: string;
  highlights: string[];
  fitFor: string;
  riskTips: string[];
  sourceLabel: string;
  planningMode?: PlanningMode;
  intentSummary?: string;
  blueprintSummary?: string;
  arrangementReason?: string;
  skipSuggestion?: string;
  weatherAlternative?: string;
  revisionNote?: string;
  revisionSummary?: string;
  providerWarnings?: string[];
  evidenceSummary?: string;
  evidenceSources?: StopEvidence[];
  pretripChecklist?: PretripChecklistItem[];
  qualitySummary?: RouteQualitySummary;
  planningTrace?: PlanningTraceEvent[];
  startDate: string;
  endDate?: string;
  durationDays: 1 | 2;
  estimatedCostCny: number;
  stops: RouteStop[];
  legs: RouteLeg[];
  confidence: number;
  confidenceTier: ConfidenceTier;
  degraded: boolean;
  degradedReason: string;
  sourceMode: SourceMode;
  share: ShareCopy;
  createdAt: string;
};

export type SavedRouteCardSummary = {
  id: string;
  sharePath: string;
  city: string;
  themeLabel: string;
  title: string;
  startDate: string;
  confidence: number;
  createdAt: string;
};
