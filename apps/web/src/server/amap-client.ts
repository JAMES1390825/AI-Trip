import type { AmapPoiQuery } from "@/domain/route-blueprint";

export type RealPoiCandidate = {
  id: string;
  providerPoiId: string;
  name: string;
  city: string;
  address: string;
  providerType: string;
  lat: number;
  lng: number;
  tags: string[];
  sourceMode: "provider";
};

export type AmapClientOptions = {
  key?: string;
  fetcher?: typeof fetch;
};

export type WalkingEstimateInput = {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseLocation(location: string): { lat: number; lng: number } | null {
  const [lngRaw, latRaw] = location.split(",");
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function tagsFromType(type: string): string[] {
  const tags: string[] = [];
  if (type.includes("风景") || type.includes("景点")) tags.push("landmark");
  if (type.includes("餐饮") || type.includes("小吃")) tags.push("local_food");
  if (type.includes("咖啡")) tags.push("coffee");
  if (type.includes("博物馆") || type.includes("文化")) tags.push("culture", "indoor");
  if (type.includes("购物")) tags.push("shopping");
  tags.push("walkable");
  return Array.from(new Set(tags));
}

export function normalizeAmapPois(payload: unknown, city: string): RealPoiCandidate[] {
  const rawPois = Array.isArray((payload as { pois?: unknown }).pois) ? (payload as { pois: unknown[] }).pois : [];
  const seen = new Set<string>();
  const results: RealPoiCandidate[] = [];

  for (const raw of rawPois) {
    const poi = raw as Record<string, unknown>;
    const providerPoiId = asString(poi.id);
    const name = asString(poi.name);
    const location = parseLocation(asString(poi.location));
    if (!providerPoiId || !name || !location || seen.has(providerPoiId)) continue;
    seen.add(providerPoiId);
    const providerType = asString(poi.type);
    results.push({
      id: providerPoiId,
      providerPoiId,
      name,
      city,
      address: asString(poi.address),
      providerType,
      lat: location.lat,
      lng: location.lng,
      tags: tagsFromType(providerType),
      sourceMode: "provider"
    });
  }

  return results;
}

export class AmapClient {
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AmapClientOptions = {}) {
    this.key = options.key || process.env.AMAP_WEB_SERVICE_KEY || "";
    this.fetcher = options.fetcher || fetch;
  }

  async searchPois(query: AmapPoiQuery): Promise<RealPoiCandidate[]> {
    if (!this.key) return [];
    const url = new URL("https://restapi.amap.com/v5/place/text");
    url.searchParams.set("key", this.key);
    url.searchParams.set("keywords", query.keywords);
    url.searchParams.set("region", query.city);
    url.searchParams.set("city_limit", "true");
    url.searchParams.set("page_size", String(query.limit));
    const response = await this.fetcher(url);
    if (!response.ok) return [];
    return normalizeAmapPois(await response.json(), query.city);
  }

  async estimateWalkingMinutes(input: WalkingEstimateInput): Promise<number | null> {
    if (!this.key) return null;
    const url = new URL("https://restapi.amap.com/v5/direction/walking");
    url.searchParams.set("key", this.key);
    url.searchParams.set("origin", `${input.from.lng},${input.from.lat}`);
    url.searchParams.set("destination", `${input.to.lng},${input.to.lat}`);
    const response = await this.fetcher(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const duration = Number((payload as { route?: { paths?: Array<{ duration?: string }> } }).route?.paths?.[0]?.duration || 0);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return Math.max(1, Math.round(duration / 60));
  }
}
