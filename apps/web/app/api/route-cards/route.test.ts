import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";

test("POST /api/route-cards saves a generated route card and GET lists summaries", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "route-cards-api-"));
  process.env.ROUTE_CARD_DATA_FILE = path.join(tempDir, "route-cards.json");

  try {
    const { GET, POST } = await import("./route");
    const routeCard = generateRouteCard({
      city: "上海",
      themeId: "classic",
      startDate: "2026-05-10",
      durationDays: 1,
      note: ""
    });

    const saveResponse = await POST(
      new Request("http://localhost/api/route-cards", {
        method: "POST",
        body: JSON.stringify({ routeCard })
      }),
    );
    assert.equal(saveResponse.status, 201);

  const listResponse = await GET();
  assert.equal(listResponse.status, 200);
  const payload = await listResponse.json();
  const savedItem = payload.items.find((item: { id: string }) => item.id === routeCard.id);
  assert.ok(savedItem);
  assert.equal(savedItem.sharePath, `/share/${routeCard.id}`);
  } finally {
    delete process.env.ROUTE_CARD_DATA_FILE;
    await rm(tempDir, { recursive: true, force: true });
  }
});
