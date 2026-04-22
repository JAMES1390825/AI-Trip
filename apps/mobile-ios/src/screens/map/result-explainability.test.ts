import assert from "node:assert/strict";
import test from "node:test";
import { buildResultExplainability } from "./result-explainability";

test("buildResultExplainability returns pass status for validated itineraries", () => {
  const model = buildResultExplainability({
    confidence: 0.74,
    sourceMode: "provider",
    degraded: false,
    degradedReason: "",
    warnings: [],
    validationResult: {
      passed: true,
      confidenceTier: "medium",
      issues: [],
      coverage: {
        providerGroundedBlocks: 6,
        routeEvidenceCoverage: 0.8,
        weatherEvidenceCoverage: 0.5,
        mustGoHitRate: 1,
      },
    },
  } as any);

  assert.equal(model.validation.label, "校验通过");
  assert.equal(model.confidenceText, "74%");
  assert.equal(model.degradedMessage, "");
});

test("buildResultExplainability returns downgrade message when itinerary is degraded", () => {
  const model = buildResultExplainability({
    confidence: 0.52,
    sourceMode: "fallback",
    degraded: true,
    degradedReason: "provider_coverage_low",
    warnings: [],
    validationResult: null,
  } as any);

  assert.equal(model.validation.label, "待校验");
  assert.equal(model.degradedMessage, "真实地图数据覆盖不足，当前仍是内置事实草案。");
});

test("buildResultExplainability surfaces first validation issue when validation failed", () => {
  const model = buildResultExplainability({
    confidence: 0.41,
    sourceMode: "provider",
    degraded: true,
    degradedReason: "validation_not_passed",
    warnings: [],
    validationResult: {
      passed: false,
      confidenceTier: "low",
      issues: [{ code: "ROUTE_LOW", message: "路线证据不足" }],
      coverage: {
        providerGroundedBlocks: 2,
        routeEvidenceCoverage: 0.25,
        weatherEvidenceCoverage: 0.1,
        mustGoHitRate: 0,
      },
    },
  } as any);

  assert.equal(model.validation.label, "校验未通过");
  assert.equal(model.issuePreview[0], "路线证据不足");
});
