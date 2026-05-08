import type { RouteCard, SavedRouteCardSummary } from "../domain/types";
import type { PrismaRouteCardStoreClient } from "./postgres-route-card-store";
import { createPostgresRouteCardStore } from "./postgres-route-card-store";

export type RouteCardStore = {
  save(card: RouteCard): Promise<RouteCard>;
  list(): Promise<SavedRouteCardSummary[]>;
  get(id: string): Promise<RouteCard | null>;
  delete(id: string): Promise<boolean>;
};

export function createRouteCardStore(): RouteCardStore {
  const { getPrismaClient } = require("./prisma-client") as typeof import("./prisma-client");
  return createPostgresRouteCardStore(getPrismaClient() as unknown as PrismaRouteCardStoreClient);
}
