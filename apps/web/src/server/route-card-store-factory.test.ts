import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredRouteCardStore } from "./route-card-store-factory";

test("createConfiguredRouteCardStore keeps sqlite as the default transition store", () => {
  const store = createConfiguredRouteCardStore({
    env: {},
    sqliteFactory: () => ({ kind: "sqlite" }),
    postgresFactory: () => ({ kind: "postgres" })
  });

  assert.deepEqual(store, { kind: "sqlite" });
});

test("createConfiguredRouteCardStore uses PostgreSQL when explicitly configured", () => {
  const store = createConfiguredRouteCardStore({
    env: { ROUTE_CARD_STORE: "postgres" },
    sqliteFactory: () => ({ kind: "sqlite" }),
    postgresFactory: () => ({ kind: "postgres" })
  });

  assert.deepEqual(store, { kind: "postgres" });
});

test("createConfiguredRouteCardStore falls back to sqlite for unknown values", () => {
  const store = createConfiguredRouteCardStore({
    env: { ROUTE_CARD_STORE: "memory" },
    sqliteFactory: () => ({ kind: "sqlite" }),
    postgresFactory: () => ({ kind: "postgres" })
  });

  assert.deepEqual(store, { kind: "sqlite" });
});
