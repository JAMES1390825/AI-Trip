import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { access } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { generateRouteCard } from "../domain/planner";
import { createRouteCardStore } from "./route-card-store";

test("route card store saves, lists, loads, and deletes cards", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "route-card-store-"));
  const databaseFile = path.join(dir, "cards.sqlite");
  const store = createRouteCardStore(databaseFile);
  const card = generateRouteCard({
    city: "杭州",
    themeId: "easy_citywalk",
    startDate: "2026-05-10",
    durationDays: 1,
    note: "想拍照"
  });

  try {
    await store.save(card);
    await assert.doesNotReject(access(databaseFile));
    const db = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("route_cards") as { name?: string } | undefined;
      assert.equal(table?.name, "route_cards");
    } finally {
      db.close();
    }

    const list = await store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, card.id);
    assert.equal(list[0].sharePath, `/share/${card.id}`);

    const loaded = await store.get(card.id);
    assert.equal(loaded?.title, card.title);

    const reopenedStore = createRouteCardStore(databaseFile);
    const reopenedCard = await reopenedStore.get(card.id);
    assert.equal(reopenedCard?.id, card.id);

    assert.equal(await store.delete(card.id), true);
    assert.equal(await store.get(card.id), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
