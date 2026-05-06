import assert from "node:assert/strict";
import test from "node:test";
import type { RouteStop } from "./types";
import { dayTabsFor, filterStopsByDay, reorderStopsWithinDay } from "./itinerary-days";

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
