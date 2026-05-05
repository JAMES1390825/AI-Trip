import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "./planner";

test("generateRouteCard returns a route-first card with 3 to 5 executable stops", () => {
  const card = generateRouteCard({
    city: "杭州",
    themeId: "rain_backup",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照，别太累"
  });

  assert.equal(card.city, "杭州");
  assert.equal(card.themeId, "rain_backup");
  assert.ok(card.title.includes("杭州"));
  assert.ok(card.stops.length >= 3);
  assert.ok(card.stops.length <= 5);
  assert.equal(card.legs.length, card.stops.length - 1);
  assert.ok(card.stops.every((stop) => stop.mapUrl.includes("uri.amap.com/marker")));
  assert.ok(card.confidence > 0);
});

test("rain backup route prioritizes indoor or rain-friendly stops", () => {
  const card = generateRouteCard({
    city: "上海",
    themeId: "rain_backup",
    startDate: "2026-05-11",
    durationDays: 1,
    note: "下雨，想轻松一点"
  });

  const rainFriendlyCount = card.stops.filter((stop) =>
    stop.tags.some((tag) => ["indoor", "rain_friendly", "exhibition", "bookstore"].includes(tag)),
  ).length;

  assert.ok(rainFriendlyCount >= 2);
});

test("unknown city degrades clearly instead of pretending provider coverage exists", () => {
  const card = generateRouteCard({
    city: "火星",
    themeId: "classic",
    startDate: "2026-05-12",
    durationDays: 1,
    note: ""
  });

  assert.equal(card.degraded, true);
  assert.equal(card.sourceMode, "fallback");
  assert.equal(card.degradedReason, "city_seed_data_missing");
});
