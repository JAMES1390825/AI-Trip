import assert from "node:assert/strict";
import test from "node:test";
import { extractPlanVariants } from "./result-variants";

test("extractPlanVariants returns two labeled variants from plans array", () => {
  const variants = extractPlanVariants({
    plans: [
      { plan_variant: "balanced", itinerary: { destination: "上海", days: [] } },
      { plan_variant: "experience", itinerary: { destination: "上海", days: [] } },
    ],
  });

  assert.equal(variants.length, 2);
  assert.equal(variants[0].key, "balanced");
  assert.equal(variants[1].label, "体验版");
});

test("extractPlanVariants falls back to a single default variant when plans is missing", () => {
  const variants = extractPlanVariants({ destination: "上海", days: [] });

  assert.equal(variants.length, 1);
  assert.equal(variants[0].key, "default");
});
