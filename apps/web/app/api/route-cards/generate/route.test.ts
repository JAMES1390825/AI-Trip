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
  assert.ok(Array.isArray(payload.planningTrace));
  assert.ok(payload.planningTrace.some((event: { nodeId: string; status: string }) => event.nodeId === "composer" && event.status === "done"));
  assert.equal(payload.routeCard.planningTrace.length, payload.planningTrace.length);
});

test("asRequestBody preserves lightweight trip planning fields", () => {
  const body = asRequestBody({
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    endDate: "2026-05-11",
    note: "想轻松一点，有江景",
    tripPreferences: ["citywalk", "拍照出片", "少走路", "未知偏好"],
    importedText: "朋友推荐：湖滨步行街、南宋御街、城市阳台",
    startPoint: "杭州东站",
    endPoint: "湖滨银泰",
    transportPreference: "walk_first",
    companion: "friends",
    budgetRange: "balanced",
    mustVisitText: "西湖、法喜寺",
    avoidText: "不要太赶，少排队"
  });

  assert.deepEqual(body, {
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    endDate: "2026-05-11",
    durationDays: 2,
    note: "想轻松一点，有江景",
    tripPreferences: ["citywalk", "拍照出片", "少走路"],
    importedText: "朋友推荐：湖滨步行街、南宋御街、城市阳台",
    startPoint: "杭州东站",
    endPoint: "湖滨银泰",
    transportPreference: "walk_first",
    companion: "friends",
    budgetRange: "balanced",
    mustVisitText: "西湖、法喜寺",
    avoidText: "不要太赶，少排队"
  });
});

test("asRequestBody derives duration days from start and end dates", () => {
  assert.equal(
    asRequestBody({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-10",
      endDate: "2026-05-10",
      note: ""
    })?.durationDays,
    1,
  );
  assert.equal(
    asRequestBody({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-10",
      endDate: "2026-05-11",
      note: ""
    })?.durationDays,
    2,
  );
  assert.equal(
    asRequestBody({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-11",
      endDate: "2026-05-10",
      note: ""
    }),
    null,
  );
});

test("asRequestBody caps lightweight trip planning text fields", () => {
  const importedText = "行".repeat(650);
  const startPoint = "起".repeat(100);
  const endPoint = "终".repeat(100);
  const mustVisitText = "去".repeat(260);
  const avoidText = "避".repeat(260);

  const body = asRequestBody({
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 2,
    note: "想轻松一点",
    importedText,
    startPoint,
    endPoint,
    mustVisitText,
    avoidText
  });

  assert.equal(body?.importedText, importedText.slice(0, 600));
  assert.equal(body?.startPoint, startPoint.slice(0, 80));
  assert.equal(body?.endPoint, endPoint.slice(0, 80));
  assert.equal(body?.mustVisitText, mustVisitText.slice(0, 240));
  assert.equal(body?.avoidText, avoidText.slice(0, 240));
});
