import assert from "node:assert/strict";
import test from "node:test";
import { getRouteTheme, routeThemes } from "./theme-catalog";

test("routeThemes exposes the six approved planning-oriented themes", () => {
  assert.deepEqual(
    routeThemes.map((theme) => theme.id),
    ["classic", "easy_citywalk", "rain_backup", "food_linked", "night_half_day", "low_budget"],
  );
});

test("coffee and photo are style tags, not top-level route themes", () => {
  const themeIds = routeThemes.map((theme) => theme.id);
  assert.equal(themeIds.includes("coffee_slow_walk" as never), false);
  assert.equal(themeIds.includes("film_photo" as never), false);

  const easyCitywalk = getRouteTheme("easy_citywalk");
  assert.ok(easyCitywalk.styleTags.includes("coffee"));
  assert.ok(easyCitywalk.styleTags.includes("photo"));
});

test("getRouteTheme falls back to classic when the theme is unknown", () => {
  assert.equal(getRouteTheme("unknown").id, "classic");
});
