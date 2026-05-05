import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RouteCard, SavedRouteCardSummary } from "../domain/types";

type StoreState = {
  version: 1;
  routeCards: RouteCard[];
};

export type RouteCardStore = {
  save(card: RouteCard): Promise<RouteCard>;
  list(): Promise<SavedRouteCardSummary[]>;
  get(id: string): Promise<RouteCard | null>;
  delete(id: string): Promise<boolean>;
};

const defaultDataFile = process.env.ROUTE_CARD_DATA_FILE || path.join(process.cwd(), ".data", "route-cards.json");

async function readState(dataFile: string): Promise<StoreState> {
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as StoreState;
    return {
      version: 1,
      routeCards: Array.isArray(parsed.routeCards) ? parsed.routeCards : []
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { version: 1, routeCards: [] };
    }
    throw error;
  }
}

async function writeState(dataFile: string, state: StoreState): Promise<void> {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const tmpPath = `${dataFile}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  await rm(dataFile, { force: true });
  await rename(tmpPath, dataFile);
}

function summary(card: RouteCard): SavedRouteCardSummary {
  return {
    id: card.id,
    sharePath: `/share/${card.id}`,
    city: card.city,
    themeLabel: card.themeLabel,
    title: card.title,
    startDate: card.startDate,
    confidence: card.confidence,
    createdAt: card.createdAt
  };
}

export function createRouteCardStore(dataFile = defaultDataFile): RouteCardStore {
  return {
    async save(card) {
      const state = await readState(dataFile);
      const nextCards = [card, ...state.routeCards.filter((item) => item.id !== card.id)];
      await writeState(dataFile, { version: 1, routeCards: nextCards });
      return card;
    },
    async list() {
      const state = await readState(dataFile);
      return state.routeCards.map(summary);
    },
    async get(id) {
      const state = await readState(dataFile);
      return state.routeCards.find((card) => card.id === id) || null;
    },
    async delete(id) {
      const state = await readState(dataFile);
      const nextCards = state.routeCards.filter((card) => card.id !== id);
      if (nextCards.length === state.routeCards.length) return false;
      await writeState(dataFile, { version: 1, routeCards: nextCards });
      return true;
    }
  };
}
