import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";
import type { RouteCard } from "@/domain/types";
import type { RouteCardStore } from "@/server/route-card-store";
import { createRouteCardDetailHandlers } from "./[id]/route";

test("GET and DELETE /api/route-cards/:id load and remove a saved route card", async () => {
  const routeCard = generateRouteCard({
    city: "苏州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: ""
  });
  const savedCards = new Map<string, RouteCard>([[routeCard.id, routeCard]]);
  const store: RouteCardStore = {
    async save(card) {
      savedCards.set(card.id, card);
      return card;
    },
    async list() {
      return [];
    },
    async get(id) {
      return savedCards.get(id) || null;
    },
    async delete(id) {
      return savedCards.delete(id);
    }
  };
  const detailRoute = createRouteCardDetailHandlers(store);

  const context = { params: Promise.resolve({ id: routeCard.id }) };
  const detailResponse = await detailRoute.GET(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
  assert.equal(detailResponse.status, 200);
  const detailPayload = await detailResponse.json();
  assert.equal(detailPayload.routeCard.id, routeCard.id);

  const deleteResponse = await detailRoute.DELETE(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await detailRoute.GET(new Request(`http://localhost/api/route-cards/${routeCard.id}`), context);
  assert.equal(missingResponse.status, 404);
});
