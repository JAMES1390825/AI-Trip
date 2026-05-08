import type { RouteCardStore } from "./route-card-store";
import { createRouteCardStore } from "./route-card-store";
import type { PrismaRouteCardStoreClient } from "./postgres-route-card-store";

type EnvSource = Record<string, string | undefined>;

export type RouteCardStoreFactoryOptions<TStore = RouteCardStore> = {
  env?: EnvSource;
  sqliteFactory?: () => TStore;
  postgresFactory?: () => TStore;
};

function normalizedStoreKind(env: EnvSource): "sqlite" | "postgres" {
  return env.ROUTE_CARD_STORE?.trim().toLowerCase() === "postgres" ? "postgres" : "sqlite";
}

function createDefaultPostgresStore(): RouteCardStore {
  const { createPostgresRouteCardStore } = require("./postgres-route-card-store") as typeof import("./postgres-route-card-store");
  const { getPrismaClient } = require("./prisma-client") as typeof import("./prisma-client");
  return createPostgresRouteCardStore(getPrismaClient() as unknown as PrismaRouteCardStoreClient);
}

export function createConfiguredRouteCardStore<TStore = RouteCardStore>(
  options: RouteCardStoreFactoryOptions<TStore> = {},
): TStore {
  const env = options.env || process.env;
  const sqliteFactory = options.sqliteFactory || (() => createRouteCardStore() as TStore);
  const postgresFactory = options.postgresFactory || (() => createDefaultPostgresStore() as TStore);

  return normalizedStoreKind(env) === "postgres" ? postgresFactory() : sqliteFactory();
}
