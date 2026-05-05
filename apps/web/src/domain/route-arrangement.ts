import type { RealPoiCandidate } from "@/server/amap-client";

export type AiSelectedStop = {
  candidateId: string;
  day: 1 | 2;
  reason: string;
};

export type AiRouteArrangement = {
  selectedStops: AiSelectedStop[];
  arrangementReason: string;
  skipSuggestion: string;
  weatherAlternative: string;
};

export type ArrangementValidationResult =
  | { ok: true; arrangement: AiRouteArrangement }
  | { ok: false; reason: string };

function maxStops(durationDays: 1 | 2): number {
  return durationDays === 2 ? 8 : 4;
}

export function validateAiArrangement(raw: unknown, candidates: RealPoiCandidate[], durationDays: 1 | 2): ArrangementValidationResult {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "arrangement_not_object" };
  const arrangement = raw as Partial<AiRouteArrangement>;
  if (!Array.isArray(arrangement.selectedStops)) return { ok: false, reason: "selected_stops_missing" };
  if (arrangement.selectedStops.length < 3) return { ok: false, reason: "invalid_stop_count" };
  const selectedStops = arrangement.selectedStops.slice(0, maxStops(durationDays));

  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const seen = new Set<string>();
  for (const stop of selectedStops) {
    if (!allowed.has(stop.candidateId)) return { ok: false, reason: "unknown_candidate_id" };
    if (seen.has(stop.candidateId)) return { ok: false, reason: "duplicate_candidate_id" };
    seen.add(stop.candidateId);
    if (stop.day !== 1 && stop.day !== 2) return { ok: false, reason: "invalid_day" };
    if (durationDays === 1 && stop.day !== 1) return { ok: false, reason: "day_two_in_one_day_route" };
  }
  if (durationDays === 2 && !selectedStops.some((stop) => stop.day === 2)) return { ok: false, reason: "missing_day_two" };

  return {
    ok: true,
    arrangement: {
      selectedStops,
      arrangementReason: arrangement.arrangementReason || "已从真实候选地点中选择更顺路的一组。",
      skipSuggestion: arrangement.skipSuggestion || "如果体力不够，优先跳过中间停留时间最短的一站。",
      weatherAlternative: arrangement.weatherAlternative || "天气变化时优先保留室内或交通更方便的点。"
    }
  };
}

export function arrangeCandidatesByRule(candidates: RealPoiCandidate[], durationDays: 1 | 2): AiRouteArrangement {
  const limit = Math.min(maxStops(durationDays), Math.max(3, candidates.length));
  const selected = candidates.slice(0, limit);
  const splitIndex = durationDays === 2 ? Math.ceil(selected.length / 2) : selected.length;
  const indoorCandidate = selected.find((candidate) => candidate.tags.includes("indoor"));

  return {
    selectedStops: selected.map((candidate, index) => ({
      candidateId: candidate.id,
      day: durationDays === 2 && index >= splitIndex ? 2 : 1,
      reason: `${candidate.name} 来自真实地图候选，适合作为当前路线的一站。`
    })),
    arrangementReason: "已从真实地点中按可走性和主题相关性生成路线顺序。",
    skipSuggestion: selected[1] ? `如果太累，可以跳过 ${selected[1].name}，保留主线节奏。` : "如果太累，可以减少中间停留。",
    weatherAlternative: indoorCandidate ? `天气变化时优先保留 ${indoorCandidate.name}。` : "天气变化时建议优先选择室内候选或缩短户外停留。"
  };
}
