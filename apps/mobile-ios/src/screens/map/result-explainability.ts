import type { ItineraryView } from "../../types/itinerary";

type ExplainabilityTone = "success" | "warn" | "neutral";

export type ResultExplainability = {
  confidenceText: string;
  sourceModeText: string;
  validation: {
    label: string;
    tone: ExplainabilityTone;
    detail: string;
  };
  degradedMessage: string;
  coverageItems: Array<{ label: string; value: string }>;
  issuePreview: string[];
};

function percentText(value: number): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function sourceModeText(value: string): string {
  switch (String(value || "").trim()) {
    case "provider":
      return "真实地图数据";
    case "fallback":
      return "内置事实草案";
    default:
      return "未标记来源";
  }
}

function degradedReasonText(value: string): string {
  switch (String(value || "").trim()) {
    case "provider_coverage_low":
      return "真实地图数据覆盖不足，当前仍是内置事实草案。";
    case "validation_not_passed":
      return "当前结果还没有通过最终校验。";
    case "destination_custom_unresolved":
      return "目的地还没有完成标准化确认。";
    default:
      return value ? `降级原因：${value}` : "";
  }
}

export function buildResultExplainability(itineraryView: ItineraryView | null): ResultExplainability {
  const validation = itineraryView?.validationResult || null;

  return {
    confidenceText: percentText(itineraryView?.confidence || 0),
    sourceModeText: sourceModeText(itineraryView?.sourceMode || ""),
    validation: validation
      ? validation.passed
        ? { label: "校验通过", tone: "success", detail: `可信度层级 ${validation.confidenceTier || "unknown"}` }
        : { label: "校验未通过", tone: "warn", detail: `可信度层级 ${validation.confidenceTier || "unknown"}` }
      : { label: "待校验", tone: "neutral", detail: "保存前会自动校验" },
    degradedMessage: itineraryView?.degraded ? degradedReasonText(itineraryView.degradedReason) : "",
    coverageItems: validation
      ? [
          { label: "真实块数", value: String(validation.coverage.providerGroundedBlocks) },
          { label: "路线证据", value: percentText(validation.coverage.routeEvidenceCoverage) },
          { label: "天气证据", value: percentText(validation.coverage.weatherEvidenceCoverage) },
          { label: "必去命中", value: percentText(validation.coverage.mustGoHitRate) },
        ]
      : [],
    issuePreview: validation ? validation.issues.map((item) => item.message).filter(Boolean).slice(0, 2) : [],
  };
}
