import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";

test("GET and DELETE /api/route-cards/:id load and remove a saved route card", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "route-cards-detail-api-"));
  process.env.ROUTE_CARD_DATA_FILE = path.join(tempDir, "route-cards.json");

  try {
    const listRoute = await import("./route");
    const detailRoute = await import("./[id]/route");
    const routeCard = generateRouteCard({
      city: "苏州",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: ""
    });

    await listRoute.POST(
      new Request("http://localhost/api/route-cards", {
        method: "POST",
        body: JSON.stringify({ routeCard })
      }),
    );

    const context = { params: Promise.resolve({ id: routeCard.id }) };
    const detailResponse = await detailRoute.GET(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.routeCard.id, routeCard.id);

    const deleteResponse = await detailRoute.DELETE(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
    assert.equal(deleteResponse.status, 204);

    const missingResponse = await detailRoute.GET(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
    assert.equal(missingResponse.status, 404);
  } finally {
    delete process.env.ROUTE_CARD_DATA_FILE;
    await rm(tempDir, { recursive: true, force: true });
  }
});
