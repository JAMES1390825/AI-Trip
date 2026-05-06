"use client";

import { useState } from "react";
import type {
  PretripChecklistCategory,
  PretripChecklistSeverity,
  RouteCard as RouteCardData
} from "@/domain/types";
import { RouteInteractiveMap } from "./RouteInteractiveMap";

function severityLabel(severity: PretripChecklistSeverity): string {
  if (severity === "critical") return "高风险";
  if (severity === "warning") return "需确认";
  return "提醒";
}

function categoryLabel(category: PretripChecklistCategory): string {
  const labels: Record<PretripChecklistCategory, string> = {
    time: "时间",
    weather: "天气",
    traffic: "交通",
    booking: "预约",
    budget: "预算",
    comfort: "体力"
  };
  return labels[category];
}

export function RouteCard({ routeCard }: { routeCard: RouteCardData }) {
  const firstSelectableStopId = routeCard.stops[0]?.id;
  const [selectedStopId, setSelectedStopId] = useState(firstSelectableStopId);
  const activeStopId = selectedStopId || firstSelectableStopId;
  const totalTransit = routeCard.legs.reduce((sum, leg) => sum + leg.minutes, 0);
  const riskItems = Array.from(new Set([...(routeCard.riskTips || []), ...(routeCard.providerWarnings || [])]));
  const checklist = routeCard.pretripChecklist || [];
  const highestSeverity = checklist.some((item) => item.severity === "critical")
    ? "critical"
    : checklist.some((item) => item.severity === "warning")
      ? "warning"
      : "info";
  const hasWeatherRisk = checklist.some((item) => item.category === "weather");

  return (
    <article className="route-card">
      <div className="route-map">
        <RouteInteractiveMap stops={routeCard.stops} selectedStopId={activeStopId} onSelectStop={setSelectedStopId} />
      </div>
      <div className="route-card-body">
        <div className="chip-row">
          <span className="chip">{routeCard.themeLabel}</span>
          <span className="chip chip-light">{routeCard.city}</span>
          <span className="chip chip-light">{routeCard.durationDays} 日</span>
          {routeCard.planningMode ? <span className="chip chip-light">{routeCard.planningMode}</span> : null}
        </div>
        <h2>{routeCard.title}</h2>
        <p className="route-summary">{routeCard.summary}</p>
        {routeCard.intentSummary || routeCard.arrangementReason || routeCard.skipSuggestion || routeCard.weatherAlternative ? (
          <div className="explain-panel">
            {routeCard.intentSummary ? (
              <div>
                <span>路线构思</span>
                <p>{routeCard.intentSummary}</p>
              </div>
            ) : null}
            {routeCard.arrangementReason ? (
              <div>
                <span>这样安排的原因</span>
                <p>{routeCard.arrangementReason}</p>
              </div>
            ) : null}
            {routeCard.skipSuggestion ? (
              <div>
                <span>太累就跳过</span>
                <p>{routeCard.skipSuggestion}</p>
              </div>
            ) : null}
            {routeCard.weatherAlternative ? (
              <div>
                <span>天气变化备选</span>
                <p>{routeCard.weatherAlternative}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="timeline">
          {routeCard.stops.map((stop) => (
            <button
              className={stop.id === activeStopId ? "timeline-row timeline-row--selected" : "timeline-row"}
              key={stop.id}
              onClick={() => setSelectedStopId(stop.id)}
              type="button"
            >
              <span className="time">{stop.time}</span>
              <span>
                <strong>{stop.poi}</strong>
                {stop.address ? <small>{stop.address}</small> : null}
                <em>{stop.reason}</em>
              </span>
            </button>
          ))}
        </div>
        <div className="trust-panel">
          <div>
            <span>可信度</span>
            <strong>{Math.round(routeCard.confidence * 100)}%</strong>
          </div>
          <div>
            <span>路上时间</span>
            <strong>{totalTransit} 分钟</strong>
          </div>
          <div>
            <span>预算估算</span>
            <strong>¥{routeCard.estimatedCostCny}</strong>
          </div>
        </div>
        <div className="route-meta">
          <div>
            <span>适合人群</span>
            <p>{routeCard.fitFor}</p>
          </div>
          <div>
            <span>路线亮点</span>
            <ul>
              {routeCard.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </div>
          <div>
            <span>数据来源</span>
            <p>{routeCard.sourceLabel}</p>
          </div>
        </div>
        <div className="risk-list">
          {riskItems.map((tip) => (
            <span key={tip}>{tip}</span>
          ))}
        </div>
        {checklist.length ? (
          <section className="pretrip-panel">
            <div className="pretrip-heading">
              <div>
                <span>出发前检查</span>
                <h3>把不确定性提前处理掉</h3>
              </div>
              <div className="pretrip-summary">
                <strong>{checklist.length} 项</strong>
                <em>{severityLabel(highestSeverity)}</em>
                {hasWeatherRisk ? <em>天气风险</em> : null}
              </div>
            </div>
            <div className="pretrip-list">
              {checklist.map((item) => (
                <div className={`pretrip-item pretrip-item--${item.severity}`} key={item.id}>
                  <span>{categoryLabel(item.category)}</span>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <em>{item.actionLabel}</em>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {routeCard.degraded ? <p className="warning">当前为降级草案：{routeCard.degradedReason}</p> : null}
      </div>
    </article>
  );
}
