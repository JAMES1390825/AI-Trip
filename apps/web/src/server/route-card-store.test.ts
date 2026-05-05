import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRouteCard } from "../domain/planner";
import { createRouteCardStore } from "./route-card-store";

test("route card store saves, lists, loads, and deletes cards", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "route-card-store-"));
  const store = createRouteCardStore(path.join(dir, "cards.json"));
  const card = generateRouteCard({
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  try {
    await store.save(card);
    const list = await store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, card.id);

    const loaded = await store.get(card.id);
    assert.equal(loaded?.title, card.title);

    assert.equal(await store.delete(card.id), true);
    assert.equal(await store.get(card.id), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
