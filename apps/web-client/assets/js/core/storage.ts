import { DEFAULT_CONFIG, STORAGE_KEYS } from "./constants";
import { readStore, writeStore } from "./browserStore";

export type TripConfig = typeof DEFAULT_CONFIG & Record<string, unknown>;

function randomUserId(): string {
  return `ops-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureUserId(config?: Partial<TripConfig> | null): TripConfig {
  const merged = { ...DEFAULT_CONFIG, ...(config || {}) } as TripConfig;
  if (!String(merged.userId || "").trim()) {
    merged.userId = randomUserId();
    writeStore(STORAGE_KEYS.config, merged);
  }
  return merged;
}

export function getConfig(): TripConfig {
  return ensureUserId(readStore<TripConfig>(STORAGE_KEYS.config, DEFAULT_CONFIG as TripConfig));
}

export function updateConfig(patch: Record<string, unknown> = {}): TripConfig {
  const next = ensureUserId({ ...getConfig(), ...(patch || {}) });
  writeStore(STORAGE_KEYS.config, next);
  return next;
}
