function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededScore(seed: string | undefined, id: string): number {
  if (!seed) return 0;
  return hashString(`${seed}:${id}`) / 0xffffffff;
}

export function seededShuffle<T extends { id: string }>(items: T[], seed: string | undefined): T[] {
  if (!seed) return items;
  return [...items].sort((left, right) => seededScore(seed, right.id) - seededScore(seed, left.id));
}
