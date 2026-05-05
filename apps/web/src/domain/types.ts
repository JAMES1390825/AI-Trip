export type RouteThemeId =
  | "classic"
  | "easy_citywalk"
  | "rain_backup"
  | "food_linked"
  | "night_half_day"
  | "low_budget";

export type SourceMode = "fallback" | "provider" | "mixed";

export type ConfidenceTier = "high" | "medium" | "needs_confirmation";

export type RouteTheme = {
  id: RouteThemeId;
  label: string;
  promise: string;
  primaryTags: string[];
  styleTags: string[];
  avoidTags: string[];
  defaultDurationDays: 1 | 2;
};

export type RouteCardRequest = {
  city: string;
  themeId: RouteThemeId;
  startDate: string;
  durationDays: 1 | 2;
  note: string;
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
  poi: string;
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
  startDate: string;
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
