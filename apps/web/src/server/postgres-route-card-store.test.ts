import assert from "node:assert/strict";
import test from "node:test";
import { generateRouteCard } from "../domain/planner";
import { createPostgresRouteCardStore } from "./postgres-route-card-store";

class FakeRouteCardDelegate {
  public rows = new Map<string, RouteCardRow>();
  public upserts: unknown[] = [];

  async upsert(payload: {
    where: { id: string };
    create: RouteCardRow;
    update: Omit<RouteCardRow, "id">;
  }): Promise<RouteCardRow> {
    this.upserts.push(payload);
    const next = this.rows.has(payload.where.id)
      ? { ...this.rows.get(payload.where.id) as RouteCardRow, ...payload.update }
      : payload.create;
    this.rows.set(payload.where.id, next);
    return next;
  }

  async findMany(): Promise<RouteCardRow[]> {
    return Array.from(this.rows.values());
  }

  async findUnique(payload: { where: { id: string } }): Promise<RouteCardRow | null> {
    return this.rows.get(payload.where.id) || null;
  }

  async deleteMany(payload: { where: { id: string } }): Promise<{ count: number }> {
    const existed = this.rows.delete(payload.where.id);
    return { count: existed ? 1 : 0 };
  }
}

type RouteCardRow = {
  id: string;
  city: string;
  themeLabel: string;
  title: string;
  startDate: string;
  confidence: number;
  createdAt: Date;
  payload: unknown;
};

test("createPostgresRouteCardStore saves normalized summary fields and payload", async () => {
  const routeCard = generateRouteCard({
    city: "杭州",
    themeId: "classic",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想少走路"
  });
  const delegate = new FakeRouteCardDelegate();
  const store = createPostgresRouteCardStore({ routeCard: delegate });

  await store.save(routeCard);

  assert.deepEqual(delegate.upserts[0], {
    where: { id: routeCard.id },
    create: {
      id: routeCard.id,
      city: routeCard.city,
      themeLabel: routeCard.themeLabel,
      title: routeCard.title,
      startDate: routeCard.startDate,
      confidence: routeCard.confidence,
      createdAt: new Date(routeCard.createdAt),
      payload: routeCard
    },
    update: {
      city: routeCard.city,
      themeLabel: routeCard.themeLabel,
      title: routeCard.title,
      startDate: routeCard.startDate,
      confidence: routeCard.confidence,
      createdAt: new Date(routeCard.createdAt),
      payload: routeCard
    }
  });
});

test("createPostgresRouteCardStore lists loads and deletes route cards", async () => {
  const routeCard = generateRouteCard({
    city: "上海",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "拍照"
  });
  const delegate = new FakeRouteCardDelegate();
  const store = createPostgresRouteCardStore({ routeCard: delegate });

  await store.save(routeCard);
  const list = await store.list();
  assert.equal(list[0].id, routeCard.id);
  assert.equal(list[0].sharePath, `/share/${routeCard.id}`);

  const loaded = await store.get(routeCard.id);
  assert.equal(loaded?.title, routeCard.title);

  assert.equal(await store.delete(routeCard.id), true);
  assert.equal(await store.delete(routeCard.id), false);
});
