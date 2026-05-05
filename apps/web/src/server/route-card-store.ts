import { mkdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { RouteCard, SavedRouteCardSummary } from "../domain/types";

export type RouteCardStore = {
  save(card: RouteCard): Promise<RouteCard>;
  list(): Promise<SavedRouteCardSummary[]>;
  get(id: string): Promise<RouteCard | null>;
  delete(id: string): Promise<boolean>;
};

const defaultDatabaseFile =
  process.env.ROUTE_CARD_DATABASE_FILE ||
  process.env.ROUTE_CARD_DATA_FILE ||
  path.join(process.cwd(), ".data", "route-cards.sqlite");

function summaryFromRow(row: {
  id: string;
  city: string;
  theme_label: string;
  title: string;
  start_date: string;
  confidence: number;
  created_at: string;
}): SavedRouteCardSummary {
  return {
    id: row.id,
    sharePath: `/share/${row.id}`,
    city: row.city,
    themeLabel: row.theme_label,
    title: row.title,
    startDate: row.start_date,
    confidence: row.confidence,
    createdAt: row.created_at
  };
}

function openDatabase(databaseFile: string): DatabaseSync {
  const db = new DatabaseSync(databaseFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS route_cards (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      theme_label TEXT NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_route_cards_created_at ON route_cards(created_at DESC);
  `);
  return db;
}

export function createRouteCardStore(databaseFile = defaultDatabaseFile): RouteCardStore {
  return {
    async save(card) {
      await mkdir(path.dirname(databaseFile), { recursive: true });
      const db = openDatabase(databaseFile);
      try {
        db.prepare(`
          INSERT INTO route_cards (id, city, theme_label, title, start_date, confidence, created_at, payload)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            city = excluded.city,
            theme_label = excluded.theme_label,
            title = excluded.title,
            start_date = excluded.start_date,
            confidence = excluded.confidence,
            created_at = excluded.created_at,
            payload = excluded.payload
        `).run(
          card.id,
          card.city,
          card.themeLabel,
          card.title,
          card.startDate,
          card.confidence,
          card.createdAt,
          JSON.stringify(card),
        );
      } finally {
        db.close();
      }
      return card;
    },
    async list() {
      await mkdir(path.dirname(databaseFile), { recursive: true });
      const db = openDatabase(databaseFile);
      try {
        const rows = db.prepare(`
          SELECT id, city, theme_label, title, start_date, confidence, created_at
          FROM route_cards
          ORDER BY created_at DESC
        `).all() as Array<{
          id: string;
          city: string;
          theme_label: string;
          title: string;
          start_date: string;
          confidence: number;
          created_at: string;
        }>;
        return rows.map(summaryFromRow);
      } finally {
        db.close();
      }
    },
    async get(id) {
      await mkdir(path.dirname(databaseFile), { recursive: true });
      const db = openDatabase(databaseFile);
      try {
        const row = db.prepare("SELECT payload FROM route_cards WHERE id = ?").get(id) as { payload: string } | undefined;
        return row ? JSON.parse(row.payload) as RouteCard : null;
      } finally {
        db.close();
      }
    },
    async delete(id) {
      await mkdir(path.dirname(databaseFile), { recursive: true });
      const db = openDatabase(databaseFile);
      try {
        const result = db.prepare("DELETE FROM route_cards WHERE id = ?").run(id);
        return result.changes > 0;
      } finally {
        db.close();
      }
    }
  };
}
