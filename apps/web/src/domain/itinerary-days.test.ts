import assert from "node:assert/strict";
import test from "node:test";
import type { RouteStop } from "./types";
import {
  dayTabsFor,
  filterStopsByDay,
  initialItineraryState,
  itinerarySourceKey,
  reorderStopsWithinDay,
  resolveItineraryState
} from "./itinerary-days";

function stop(id: string, day: 1 | 2): RouteStop {
  return {
    id,
    time: "10:00",
    poiId: id,
    poi: id,
    day,
    tags: [],
    lat: 30,
    lng: 120,
    mapUrl: "https://example.com/map",
    reason: "route reason",
    risk: "route risk",
    sourceMode: "provider"
  };
}

test("dayTabsFor returns overview and existing route days", () => {
  assert.deepEqual(dayTabsFor([stop("a", 1), stop("b", 2)]), [
    { id: "overview", label: "总览", day: undefined, stopCount: 2 },
    { id: "day-1", label: "DAY1", day: 1, stopCount: 1 },
    { id: "day-2", label: "DAY2", day: 2, stopCount: 1 }
  ]);
  assert.deepEqual(dayTabsFor([stop("a", 1)]), [
    { id: "overview", label: "总览", day: undefined, stopCount: 1 },
    { id: "day-1", label: "DAY1", day: 1, stopCount: 1 }
  ]);
});

test("filterStopsByDay keeps overview complete and day tab focused", () => {
  const stops = [stop("a", 1), stop("b", 2), stop("c", 1)];

  assert.deepEqual(filterStopsByDay(stops, "overview").map(({ id }) => id), ["a", "b", "c"]);
  assert.deepEqual(filterStopsByDay(stops, "day-1").map(({ id }) => id), ["a", "c"]);
  assert.deepEqual(filterStopsByDay(stops, "day-2").map(({ id }) => id), ["b"]);
});

test("reorderStopsWithinDay moves stops only inside the active day", () => {
  const stops = [stop("a", 1), stop("b", 2), stop("c", 1), stop("d", 2), stop("e", 1)];
  const reordered = reorderStopsWithinDay(stops, 1, "e", "a");

  assert.deepEqual(reordered.map(({ id }) => id), ["e", "b", "a", "d", "c"]);
  assert.deepEqual(stops.map(({ id }) => id), ["a", "b", "c", "d", "e"]);
});

test("resolveItineraryState resets stale local state when route source changes", () => {
  const previousStops = [stop("a", 1), stop("b", 1)];
  const nextStops = [stop("x", 1), stop("y", 2)];
  const previousState = {
    sourceKey: itinerarySourceKey("old-card", previousStops),
    activeTab: "day-1" as const,
    orderedStops: [previousStops[1], previousStops[0]],
    selectedStopId: "b",
    needsRevalidation: true
  };

  assert.deepEqual(resolveItineraryState(previousState, itinerarySourceKey("new-card", nextStops), nextStops), {
    sourceKey: itinerarySourceKey("new-card", nextStops),
    activeTab: "overview",
    orderedStops: nextStops,
    selectedStopId: "x",
    needsRevalidation: false
  });
  assert.equal(resolveItineraryState(previousState, previousState.sourceKey, previousStops), previousState);
  const nextState = resolveItineraryState(previousState, itinerarySourceKey("new-card", nextStops), nextStops);
  assert.deepEqual(resolveItineraryState(nextState, itinerarySourceKey("old-card", previousStops), previousStops), {
    sourceKey: itinerarySourceKey("old-card", previousStops),
    activeTab: "overview",
    orderedStops: previousStops,
    selectedStopId: "a",
    needsRevalidation: false
  });
  assert.deepEqual(initialItineraryState("empty-card", []), {
    sourceKey: "empty-card::",
    activeTab: "overview",
    orderedStops: [],
    selectedStopId: undefined,
    needsRevalidation: false
  });
});

test("itinerarySourceKey changes when existing stops receive refreshed details", () => {
  const originalStops = [stop("a", 1), stop("b", 1)];
  const refreshedStops = [
    {
      ...originalStops[0],
      address: "新的地址",
      providerType: "风景名胜",
      reason: "新的推荐理由",
      risk: "新的风险提示",
      tags: ["photo"]
    },
    originalStops[1]
  ];

  assert.notEqual(itinerarySourceKey("same-card", originalStops), itinerarySourceKey("same-card", refreshedStops));
});

test("itinerarySourceKey changes when existing stops receive refreshed navigation urls", () => {
  const originalStops = [stop("a", 1), stop("b", 1)];
  const refreshedStops = [
    {
      ...originalStops[0],
      mapUrl: "https://uri.amap.com/marker?position=120.2,30.2&name=refreshed"
    },
    originalStops[1]
  ];

  assert.notEqual(itinerarySourceKey("same-card", originalStops), itinerarySourceKey("same-card", refreshedStops));
});
