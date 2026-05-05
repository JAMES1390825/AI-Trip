import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "./route";

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
