import assert from "node:assert/strict";
import test from "node:test";
import { arrangeCandidatesByRule, validateAiArrangement } from "./route-arrangement";
import type { RealPoiCandidate } from "@/server/amap-client";

const candidates: RealPoiCandidate[] = [
  { id: "a", providerPoiId: "a", name: "A", city: "杭州", address: "A路", providerType: "景点", lat: 30, lng: 120, tags: ["landmark", "photo"], sourceMode: "provider" },
  { id: "b", providerPoiId: "b", name: "B", city: "杭州", address: "B路", providerType: "餐饮", lat: 30.01, lng: 120.01, tags: ["local_food"], sourceMode: "provider" },
  { id: "c", providerPoiId: "c", name: "C", city: "杭州", address: "C路", providerType: "文化", lat: 30.02, lng: 120.02, tags: ["culture"], sourceMode: "provider" },
  { id: "d", providerPoiId: "d", name: "D", city: "杭州", address: "D路", providerType: "咖啡", lat: 30.03, lng: 120.03, tags: ["coffee"], sourceMode: "provider" }
];

test("validateAiArrangement rejects unknown candidate ids", () => {
  const result = validateAiArrangement(
    { selectedStops: [{ candidateId: "missing", day: 1, reason: "bad" }], arrangementReason: "x", skipSuggestion: "x", weatherAlternative: "x" },
    candidates,
    1,
  );

  assert.equal(result.ok, false);
});

test("validateAiArrangement rejects duplicate candidate ids", () => {
  const result = validateAiArrangement(
    { selectedStops: [{ candidateId: "a", day: 1, reason: "x" }, { candidateId: "a", day: 1, reason: "x" }], arrangementReason: "x", skipSuggestion: "x", weatherAlternative: "x" },
    candidates,
    1,
  );

  assert.equal(result.ok, false);
});

test("arrangeCandidatesByRule returns day assignments and user-facing explanations", () => {
  const arrangement = arrangeCandidatesByRule(candidates, 2);

  assert.equal(arrangement.selectedStops.length, 4);
  assert.ok(arrangement.selectedStops.some((stop) => stop.day === 1));
  assert.ok(arrangement.selectedStops.some((stop) => stop.day === 2));
  assert.match(arrangement.arrangementReason, /真实地点|可走/);
  assert.ok(arrangement.skipSuggestion);
});
