import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "@/domain/planner";
import type { RouteCard } from "@/domain/types";
import type { RouteCardStore } from "@/server/route-card-store";
import { createRouteCardHandlers } from "./route";

test("POST /api/route-cards saves a generated route card and GET lists summaries", async () => {
  const savedCards = new Map<string, RouteCard>();
  const store: RouteCardStore = {
    async save(card) {
      savedCards.set(card.id, card);
      return card;
    },
    async list() {
      return Array.from(savedCards.values()).map((card) => ({
        id: card.id,
        sharePath: `/share/${card.id}`,
        city: card.city,
        themeLabel: card.themeLabel,
        title: card.title,
        startDate: card.startDate,
        confidence: card.confidence,
        createdAt: card.createdAt
      }));
    },
    async get(id) {
      return savedCards.get(id) || null;
    },
    async delete(id) {
      return savedCards.delete(id);
    }
  };
  const { GET, POST } = createRouteCardHandlers(store);
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
});
