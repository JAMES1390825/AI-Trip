import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackBlueprint, searchSlotsToAmapQueries } from "./route-blueprint";
import { inferUserIntent } from "./user-intent";

test("buildFallbackBlueprint creates abstract search slots without concrete POI names", () => {
  const intent = inferUserIntent({ themeId: "classic", note: "想拍照，别太累" });
  const blueprint = buildFallbackBlueprint({
    city: "杭州",
    themeId: "classic",
    durationDays: 2,
    note: "想拍照，别太累",
    intent
  });

  assert.equal(blueprint.days.length, 2);
  assert.ok(blueprint.searchSlots.some((slot) => slot.intent.includes("classic")));
  assert.ok(blueprint.searchSlots.some((slot) => slot.tags.includes("photo")));
  assert.ok(!blueprint.searchSlots.some((slot) => slot.query.includes("西湖")));
});

test("searchSlotsToAmapQueries maps slots to city-scoped keyword queries", () => {
  const intent = inferUserIntent({ themeId: "food_linked", note: "想吃小吃" });
  const blueprint = buildFallbackBlueprint({
    city: "成都",
    themeId: "food_linked",
    durationDays: 1,
    note: "想吃小吃",
    intent
  });

  const queries = searchSlotsToAmapQueries("成都", blueprint.searchSlots);

  assert.ok(queries.length >= 3);
  assert.ok(queries.every((query) => query.city === "成都"));
  assert.ok(queries.some((query) => query.keywords.includes("小吃") || query.keywords.includes("美食")));
});
