import assert from "node:assert/strict";
import test from "node:test";
import { POST, asRequestBody } from "./route";

test("POST /api/route-cards/generate returns a generated route card", async () => {
  const response = await POST(
    new Request("http://localhost/api/route-cards/generate", {
      method: "POST",
      body: JSON.stringify({
        city: "杭州",
        themeId: "easy_citywalk",
        startDate: "2026-05-10",
        durationDays: 1,
        note: "想拍照"
      })
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.routeCard.city, "杭州");
  assert.ok(payload.routeCard.stops.length >= 3);
});

test("asRequestBody preserves lightweight trip planning fields", () => {
  const body = asRequestBody({
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 2,
    note: "想轻松一点，有江景",
    tripPreferences: ["citywalk", "拍照出片", "少走路", "未知偏好"],
    importedText: "朋友推荐：湖滨步行街、南宋御街、城市阳台",
    startPoint: "杭州东站",
    endPoint: "湖滨银泰",
    transportPreference: "walk_first",
    companion: "friends"
  });

  assert.deepEqual(body, {
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 2,
    note: "想轻松一点，有江景",
    tripPreferences: ["citywalk", "拍照出片", "少走路"],
    importedText: "朋友推荐：湖滨步行街、南宋御街、城市阳台",
    startPoint: "杭州东站",
    endPoint: "湖滨银泰",
    transportPreference: "walk_first",
    companion: "friends"
  });
});
