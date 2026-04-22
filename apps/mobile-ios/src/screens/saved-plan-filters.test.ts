import assert from "node:assert/strict";
import test from "node:test";
import { filterSavedPlans } from "./saved-plan-filters";

const sample = [
  {
    id: "1",
    destination: "上海",
    start_date: "2026-05-01",
    confidence: 0.9,
    saved_at: "2026-04-20T08:00:00Z",
    updated_at: "2026-04-20T08:00:00Z",
    granularity: "day",
  },
  {
    id: "2",
    destination: "杭州",
    start_date: "2026-04-01",
    confidence: 0.45,
    saved_at: "2026-04-18T08:00:00Z",
    updated_at: "2026-04-18T08:00:00Z",
    granularity: "day",
  },
] as any;

test("filterSavedPlans matches destination query", () => {
  const items = filterSavedPlans(sample, "上", "all", "2026-04-22");
  assert.equal(items.length, 1);
  assert.equal(items[0].destination, "上海");
});

test("filterSavedPlans keeps only future trips for upcoming filter", () => {
  const items = filterSavedPlans(sample, "", "upcoming", "2026-04-22");
  assert.equal(items.length, 1);
  assert.equal(items[0].destination, "上海");
});

test("filterSavedPlans keeps only high confidence trips", () => {
  const items = filterSavedPlans(sample, "", "high_confidence", "2026-04-22");
  assert.equal(items.length, 1);
  assert.equal(items[0].destination, "上海");
});
