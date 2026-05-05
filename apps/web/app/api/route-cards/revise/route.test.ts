import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";

const providerEnvKeys = ["AMAP_WEB_SERVICE_KEY", "AI_PROVIDER", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "BAILIAN_API_KEY"] as const;

async function withOfflinePlanning<T>(run: () => Promise<T>): Promise<T> {
  const original: Partial<Record<(typeof providerEnvKeys)[number], string>> = {};
  for (const key of providerEnvKeys) {
    original[key] = process.env[key];
    delete process.env[key];
  }

  try {
    return await run();
  } finally {
    for (const key of providerEnvKeys) {
      const value = original[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("POST /api/route-cards/revise returns a revised route card with revision metadata", async () => {
  await withOfflinePlanning(async () => {
    const { POST } = await import("./route");
    const routeCard = generateRouteCard({
      city: "杭州",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: "想拍照"
    });

    const response = await POST(
      new Request("http://localhost/api/route-cards/revise", {
        method: "POST",
        body: JSON.stringify({ routeCard, reviseNote: "少走路一点，加一个吃饭点" })
      }),
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.routeCard.city, "杭州");
    assert.equal(payload.routeCard.revisionNote, "少走路一点，加一个吃饭点");
    assert.match(payload.routeCard.revisionSummary, /少走路一点/);
    assert.ok(payload.routeCard.stops.length >= 3);
  });
});

test("POST /api/route-cards/revise rejects empty revision notes", async () => {
  const { POST } = await import("./route");
  const routeCard = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  const response = await POST(
    new Request("http://localhost/api/route-cards/revise", {
      method: "POST",
      body: JSON.stringify({ routeCard, reviseNote: "   " })
    }),
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.code, "BAD_REQUEST");
});
