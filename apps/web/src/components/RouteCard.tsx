"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dayForTab,
  dayTabsFor,
  filterStopsByDay,
  initialItineraryState,
  itinerarySourceKey,
  reorderStopsWithinDay,
  resolveItineraryState,
  type ItineraryState,
  type ItineraryTabId
} from "@/domain/itinerary-days";
import type {
  PretripChecklistCategory,
  PretripChecklistSeverity,
  RouteCard as RouteCardData
} from "@/domain/types";
import { RouteInteractiveMap, type StopAction } from "./RouteInteractiveMap";

type RouteCardProps = {
  routeCard: RouteCardData;
  onStopAction?: (action: StopAction) => void;
  onRevalidateOrder?: (stops: RouteCardData["stops"]) => void;
  actionsDisabled?: boolean;
};

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

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function stopsForRevalidation(stops: RouteCardData["stops"], activeDay?: 1 | 2): RouteCardData["stops"] {
  return activeDay ? stops.filter((stop) => (stop.day || 1) === activeDay) : stops;
}

export function RouteCard({ routeCard, onStopAction, onRevalidateOrder, actionsDisabled = false }: RouteCardProps) {
  const [localItineraryState, setLocalItineraryState] = useState<ItineraryState>(() =>
    initialItineraryState(routeCard.id, routeCard.stops),
  );
  const [draggedStopId, setDraggedStopId] = useState<string | null>(null);
  const sourceKey = itinerarySourceKey(routeCard.id, routeCard.stops);
  const itineraryState = resolveItineraryState(localItineraryState, sourceKey, routeCard.stops);
  const { activeTab, orderedStops, selectedStopId, needsRevalidation } = itineraryState;
  const itineraryTabs = dayTabsFor(orderedStops);
  const activeDay = dayForTab(activeTab);
  const visibleStops = filterStopsByDay(orderedStops, activeTab);
  const activeStopId = visibleStops.some((stop) => stop.id === selectedStopId) ? selectedStopId : visibleStops[0]?.id;
  const totalTransit = routeCard.legs.reduce((sum, leg) => sum + leg.minutes, 0);
  const riskItems = Array.from(new Set([...(routeCard.riskTips || []), ...(routeCard.providerWarnings || [])]));
  const evidenceSources = (routeCard.evidenceSources || []).filter((source) => isSafeExternalUrl(source.url)).slice(0, 4);
  const checklist = routeCard.pretripChecklist || [];
  const highestSeverity = checklist.some((item) => item.severity === "critical")
    ? "critical"
    : checklist.some((item) => item.severity === "warning")
      ? "warning"
      : "info";
  const hasWeatherRisk = checklist.some((item) => item.category === "weather");

  useEffect(() => {
    if (localItineraryState.sourceKey === sourceKey) return;
    setLocalItineraryState(resolveItineraryState(localItineraryState, sourceKey, routeCard.stops));
    setDraggedStopId(null);
  }, [localItineraryState, routeCard.stops, sourceKey]);

  const selectStop = useCallback(
    (stopId: string) => {
      setLocalItineraryState((currentState) => ({
        ...resolveItineraryState(currentState, sourceKey, routeCard.stops),
        selectedStopId: stopId
      }));
    },
    [routeCard.stops, sourceKey],
  );

  function selectTab(tabId: ItineraryTabId) {
    setDraggedStopId(null);
    const firstVisibleStop = filterStopsByDay(orderedStops, tabId)[0];
    setLocalItineraryState({
      ...itineraryState,
      activeTab: tabId,
      selectedStopId: firstVisibleStop?.id
    });
  }

  function dropStopOn(targetId: string) {
    if (!activeDay || !draggedStopId) return;
    setLocalItineraryState({
      ...itineraryState,
      orderedStops: reorderStopsWithinDay(orderedStops, activeDay, draggedStopId, targetId),
      needsRevalidation: true
    });
    setDraggedStopId(null);
  }

  return (
    <article className="route-card">
      <div className="route-map">
        <RouteInteractiveMap
          stops={visibleStops}
          selectedStopId={activeStopId}
          onSelectStop={selectStop}
          onStopAction={onStopAction}
          actionsDisabled={actionsDisabled}
        />
      </div>
      <div className="route-card-body">
        <div className="chip-row">
          <span className="chip">{routeCard.themeLabel}</span>
          <span className="chip chip-light">{routeCard.city}</span>
          <span className="chip chip-light">{routeCard.durationDays} 日</span>
          {routeCard.planningMode ? <span className="chip chip-light">{routeCard.planningMode}</span> : null}
        </div>
        <div aria-label="行程视图" className="itinerary-tabs" role="tablist">
          {itineraryTabs.map((tab) => (
            <button
              aria-selected={tab.id === activeTab}
              className={tab.id === activeTab ? "itinerary-tab itinerary-tab--active" : "itinerary-tab"}
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <small>{tab.stopCount} 站</small>
            </button>
          ))}
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
          {visibleStops.map((stop) => (
            <button
              className={stop.id === activeStopId ? "timeline-row timeline-row--selected" : "timeline-row"}
              draggable={activeTab !== "overview"}
              key={stop.id}
              onDragEnd={() => setDraggedStopId(null)}
              onDragOver={(event) => {
                if (activeDay) event.preventDefault();
              }}
              onDragStart={() => setDraggedStopId(stop.id)}
              onDrop={(event) => {
                event.preventDefault();
                dropStopOn(stop.id);
              }}
              onClick={() => selectStop(stop.id)}
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
        {needsRevalidation ? (
          <div className="route-revalidation-note">
            <p>顺序已调整，需要重新校验路线时间。</p>
            {onRevalidateOrder ? (
              <button
                disabled={actionsDisabled}
                onClick={() => onRevalidateOrder(stopsForRevalidation(orderedStops, activeDay))}
                type="button"
              >
                重新校验路线
              </button>
            ) : null}
          </div>
        ) : null}
        <section className="day-itinerary-panel">
          <div className="day-itinerary-heading">
            <span>每日行程</span>
            <strong>{activeDay ? `DAY${activeDay} 工作台` : "全程鸟瞰"}</strong>
          </div>
          <div className="day-itinerary-grid">
            {itineraryTabs.filter((tab) => tab.day).map((tab) => {
              const dayStops = filterStopsByDay(orderedStops, tab.id);
              return (
                <div className="day-itinerary-card" key={tab.id}>
                  <span>{tab.label}</span>
                  <strong>{dayStops.map((stop) => stop.poi).join(" → ")}</strong>
                  <p>{dayStops.length ? `${dayStops[0].time} 开始 · ${dayStops.length} 个点位` : "暂无点位"}</p>
                </div>
              );
            })}
          </div>
        </section>
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
        {routeCard.evidenceSummary || evidenceSources.length ? (
          <section className="evidence-panel">
            <div>
              <span>公开攻略证据</span>
              {routeCard.evidenceSummary ? <p>{routeCard.evidenceSummary}</p> : null}
            </div>
            {evidenceSources.length ? (
              <ul className="evidence-list">
                {evidenceSources.map((source) => (
                  <li key={`${source.sourceName}-${source.url}`}>
                    <a href={source.url} rel="noreferrer" target="_blank">
                      <strong>{source.sourceName}</strong>
                      <span>{source.title}</span>
                    </a>
                    <p>{source.snippet || source.usedFor}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
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
