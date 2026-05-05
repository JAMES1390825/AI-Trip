import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "./planner";
import { reviseRouteCard } from "./route-revision";
import type { RouteCardRequest } from "./types";

test("reviseRouteCard enriches the next request and annotates the revised card", async () => {
  const original = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });
  const capturedRequests: RouteCardRequest[] = [];

  const revised = await reviseRouteCard(
    { routeCard: original, reviseNote: "少走路一点，加一个吃饭点" },
    {
      planner: async (request) => {
        capturedRequests.push(request);
        return {
          ...original,
          id: "revised-card",
          title: `${original.title} 调整版`,
          createdAt: "2026-05-10T00:00:00.000Z"
        };
      }
    },
  );

  const capturedRequest = capturedRequests[0];
  assert.ok(capturedRequest);
  assert.equal(capturedRequest.city, original.city);
  assert.equal(capturedRequest.themeId, original.themeId);
  assert.match(capturedRequest.note, /少走路一点，加一个吃饭点/);
  assert.match(capturedRequest.note, new RegExp(original.stops[0].poi));
  assert.equal(revised.id, "revised-card");
  assert.equal(revised.revisionNote, "少走路一点，加一个吃饭点");
  assert.match(revised.revisionSummary || "", /少走路一点/);
});

test("reviseRouteCard rejects empty revision notes", async () => {
  const original = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  await assert.rejects(
    () => reviseRouteCard({ routeCard: original, reviseNote: "   " }),
    /reviseNote is required/,
  );
});
