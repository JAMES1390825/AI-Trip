import assert from "node:assert/strict";
import test from "node:test";
import { inferRouteThemeId } from "./theme-inference";

test("inferRouteThemeId treats chips and notes as the route style input", () => {
  assert.equal(inferRouteThemeId({ tripPreferences: ["吃喝逛"], note: "想找本地小吃和咖啡" }), "food_linked");
  assert.equal(inferRouteThemeId({ tripPreferences: ["室内备选"], note: "可能下雨" }), "rain_backup");
  assert.equal(inferRouteThemeId({ tripPreferences: ["预算友好"], note: "少花钱" }), "low_budget");
  assert.equal(inferRouteThemeId({ tripPreferences: ["拍照出片"], note: "别太累，适合慢慢拍" }), "easy_citywalk");
});

test("inferRouteThemeId understands natural language without a template choice", () => {
  assert.equal(inferRouteThemeId({ note: "下午到，想看夜景，晚上找点好吃的" }), "night_half_day");
  assert.equal(inferRouteThemeId({ note: "第一次去，想看经典景点和历史古迹" }), "classic");
  assert.equal(inferRouteThemeId({ importedText: "朋友清单：博物馆、书店、展览，雨天也能逛" }), "rain_backup");
});
