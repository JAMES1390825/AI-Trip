import type { RouteStop } from "./types";

export type ItineraryTabId = "overview" | "day-1" | "day-2";

export type ItineraryTab = {
  id: ItineraryTabId;
  label: string;
  day?: 1 | 2;
  stopCount: number;
};

export type ItineraryState = {
  sourceKey: string;
  activeTab: ItineraryTabId;
  orderedStops: RouteStop[];
  selectedStopId?: string;
  needsRevalidation: boolean;
};

export function dayForTab(tabId: ItineraryTabId): 1 | 2 | undefined {
  if (tabId === "day-1") return 1;
  if (tabId === "day-2") return 2;
  return undefined;
}

function stopDay(stop: RouteStop): 1 | 2 {
  return stop.day || 1;
}

export function dayTabsFor(stops: RouteStop[]): ItineraryTab[] {
  const tabs: ItineraryTab[] = [
    {
      id: "overview",
      label: "总览",
      day: undefined,
      stopCount: stops.length
    }
  ];

  ([1, 2] as const).forEach((day) => {
    const stopCount = stops.filter((stop) => stopDay(stop) === day).length;
    if (stopCount) {
      tabs.push({
        id: `day-${day}`,
        label: `DAY${day}`,
        day,
        stopCount
      });
    }
  });

  return tabs;
}

export function filterStopsByDay(stops: RouteStop[], tabId: ItineraryTabId): RouteStop[] {
  const day = dayForTab(tabId);
  if (!day) return stops;
  return stops.filter((stop) => stopDay(stop) === day);
}

export function reorderStopsWithinDay(stops: RouteStop[], day: 1 | 2, draggedId: string, targetId: string): RouteStop[] {
  if (draggedId === targetId) return stops;

  const dayStops = stops.filter((stop) => stopDay(stop) === day);
  const draggedIndex = dayStops.findIndex((stop) => stop.id === draggedId);
  const targetIndex = dayStops.findIndex((stop) => stop.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0) return stops;

  const reorderedDayStops = [...dayStops];
  const [draggedStop] = reorderedDayStops.splice(draggedIndex, 1);
  reorderedDayStops.splice(targetIndex, 0, draggedStop);

  let nextDayStopIndex = 0;
  return stops.map((stop) => (stopDay(stop) === day ? reorderedDayStops[nextDayStopIndex++] : stop));
}

export function itinerarySourceKey(routeCardId: string, stops: RouteStop[]): string {
  return `${routeCardId}::${stops
    .map((stop) =>
      [
        stop.id,
        stopDay(stop),
        stop.time,
        stop.poi,
        stop.address || "",
        stop.providerType || "",
        stop.reason,
        stop.risk,
        stop.tags.join(","),
        stop.lat,
        stop.lng
      ].join("@"),
    )
    .join("|")}`;
}

export function initialItineraryState(routeCardId: string, stops: RouteStop[]): ItineraryState {
  return {
    sourceKey: itinerarySourceKey(routeCardId, stops),
    activeTab: "overview",
    orderedStops: stops,
    selectedStopId: stops[0]?.id,
    needsRevalidation: false
  };
}

export function resolveItineraryState(state: ItineraryState, sourceKey: string, stops: RouteStop[]): ItineraryState {
  if (state.sourceKey === sourceKey) {
    return state;
  }

  return {
    sourceKey,
    activeTab: "overview",
    orderedStops: stops,
    selectedStopId: stops[0]?.id,
    needsRevalidation: false
  };
}
