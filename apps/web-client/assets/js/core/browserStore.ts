export function safeParseJSON<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function readStore<T>(key: string, fallback: T): T {
  return safeParseJSON(localStorage.getItem(key), fallback);
}

export function writeStore(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
