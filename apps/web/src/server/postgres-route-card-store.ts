import type { RouteCard, SavedRouteCardSummary } from "../domain/types";
import type { RouteCardStore } from "./route-card-store";

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

type RouteCardDelegate = {
  upsert(payload: {
    where: { id: string };
    create: RouteCardRow;
    update: Omit<RouteCardRow, "id">;
  }): Promise<unknown>;
  findMany(payload?: {
    orderBy?: { createdAt: "asc" | "desc" };
    select?: Record<string, boolean>;
  }): Promise<RouteCardRow[]>;
  findUnique(payload: { where: { id: string } }): Promise<RouteCardRow | null>;
  deleteMany(payload: { where: { id: string } }): Promise<{ count: number }>;
};

export type PrismaRouteCardStoreClient = {
  routeCard: RouteCardDelegate;
};

function rowFromCard(card: RouteCard): RouteCardRow {
  return {
    id: card.id,
    city: card.city,
    themeLabel: card.themeLabel,
    title: card.title,
    startDate: card.startDate,
    confidence: card.confidence,
    createdAt: new Date(card.createdAt),
    payload: card
  };
}

function summaryFromRow(row: RouteCardRow): SavedRouteCardSummary {
  return {
    id: row.id,
    sharePath: `/share/${row.id}`,
    city: row.city,
    themeLabel: row.themeLabel,
    title: row.title,
    startDate: row.startDate,
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString()
  };
}

export function createPostgresRouteCardStore(client: PrismaRouteCardStoreClient): RouteCardStore {
  return {
    async save(card) {
      const row = rowFromCard(card);
      await client.routeCard.upsert({
        where: { id: card.id },
        create: row,
        update: {
          city: row.city,
          themeLabel: row.themeLabel,
          title: row.title,
          startDate: row.startDate,
          confidence: row.confidence,
          createdAt: row.createdAt,
          payload: row.payload
        }
      });
      return card;
    },
    async list() {
      const rows = await client.routeCard.findMany({
        orderBy: { createdAt: "desc" }
      });
      return rows.map(summaryFromRow);
    },
    async get(id) {
      const row = await client.routeCard.findUnique({ where: { id } });
      return row ? row.payload as RouteCard : null;
    },
    async delete(id) {
      const result = await client.routeCard.deleteMany({ where: { id } });
      return result.count > 0;
    }
  };
}
