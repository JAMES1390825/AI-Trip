import { getRouteTheme } from "./theme-catalog";
import type { RouteCardRequest, RouteThemeId } from "./types";
import type { UserIntent } from "./user-intent";

export type SearchSlot = {
  id: string;
  day: 1 | 2;
  intent: string;
  query: string;
  tags: string[];
  limit: number;
};

export type RouteBlueprint = {
  summary: string;
  days: Array<{ day: 1 | 2; intent: string }>;
  searchSlots: SearchSlot[];
  constraints: string[];
};

export type BlueprintInput = Pick<
  RouteCardRequest,
  | "city"
  | "themeId"
  | "durationDays"
  | "note"
  | "tripPreferences"
  | "importedText"
  | "startPoint"
  | "endPoint"
  | "transportPreference"
  | "companion"
> & {
  intent: UserIntent;
};

export type AmapPoiQuery = {
  city: string;
  keywords: string;
  slotId: string;
  limit: number;
};

const themeKeywordMap: Record<RouteThemeId, string[]> = {
  classic: ["经典 景点", "文化 街区", "城市 地标"],
  easy_citywalk: ["步行 街区", "咖啡", "拍照 街区"],
  rain_backup: ["博物馆", "展览", "书店 咖啡"],
  food_linked: ["小吃", "美食", "本地 餐厅"],
  night_half_day: ["夜景", "夜市", "江景"],
  low_budget: ["免费 景点", "公园", "平价 美食"]
};

function intentKeywords(intent: UserIntent): string[] {
  const keywords: string[] = [];
  if (intent.interestWeights.photo >= 4) keywords.push("拍照");
  if (intent.interestWeights.food >= 4) keywords.push("小吃");
  if (intent.interestWeights.coffee >= 4) keywords.push("咖啡");
  if (intent.interestWeights.rainSafety >= 3) keywords.push("室内");
  if (intent.budgetPosture === "low") keywords.push("免费");
  return keywords;
}

function preferenceKeywords(preferences: RouteCardRequest["tripPreferences"] = []): string[] {
  const keywords: string[] = [];
  if (preferences.includes("经典必玩")) keywords.push("经典 景点");
  if (preferences.includes("吃喝逛")) keywords.push("小吃", "本地 餐厅");
  if (preferences.includes("亲子")) keywords.push("亲子 适合");
  if (preferences.includes("citywalk")) keywords.push("步行 街区");
  if (preferences.includes("历史古迹")) keywords.push("历史 古迹");
  if (preferences.includes("小众探索")) keywords.push("小众 景点");
  if (preferences.includes("拍照出片")) keywords.push("拍照 出片");
  if (preferences.includes("自然风光")) keywords.push("自然 风景");
  if (preferences.includes("文艺展览")) keywords.push("展览 美术馆");
  if (preferences.includes("室内备选")) keywords.push("室内 展馆");
  if (preferences.includes("预算友好")) keywords.push("免费 景点");
  return keywords;
}

function importedTextKeywords(importedText?: string): string[] {
  const text = (importedText || "").trim();
  if (!text) return [];
  return text
    .split(/[，,、\n]/)
    .map((part) => part.replace(/朋友推荐|收藏了|推荐|想去/g, "").trim())
    .filter((part) => part.length >= 2)
    .slice(0, 4);
}

export function buildFallbackBlueprint(input: BlueprintInput): RouteBlueprint {
  const theme = getRouteTheme(input.themeId);
  const days =
    input.durationDays === 2
      ? [
          { day: 1 as const, intent: `${theme.label} opening day with low-friction anchors` },
          { day: 2 as const, intent: `${theme.label} slower second day with food or culture` }
        ]
      : [{ day: 1 as const, intent: `${theme.label} executable day route` }];

  const baseQueries = [
    ...themeKeywordMap[input.themeId],
    ...intentKeywords(input.intent),
    ...preferenceKeywords(input.tripPreferences),
    ...importedTextKeywords(input.importedText)
  ];
  const uniqueQueries = Array.from(new Set(baseQueries));
  const searchSlots = uniqueQueries.map((query, index): SearchSlot => ({
    id: `slot-${index + 1}`,
    day: input.durationDays === 2 && index >= Math.ceil(uniqueQueries.length / 2) ? 2 : 1,
    intent: `${theme.id}:${query}`,
    query,
    tags: [...theme.primaryTags, ...theme.styleTags, query.includes("拍照") ? "photo" : ""].filter(Boolean),
    limit: 8
  }));

  return {
    summary: `${input.durationDays}日${theme.label}：${input.intent.intentSummary}`,
    days,
    searchSlots,
    constraints: [
      "single-day 3-4 main stops",
      "avoid unnecessary long transfers",
      "do not invent POIs",
      ...(input.importedText ? ["imported places are search hints, not guaranteed stops"] : []),
      ...(input.startPoint ? [`start near ${input.startPoint}`] : []),
      ...(input.endPoint ? [`end near ${input.endPoint}`] : [])
    ]
  };
}

export function searchSlotsToAmapQueries(city: string, slots: SearchSlot[]): AmapPoiQuery[] {
  return slots.map((slot) => ({
    city,
    keywords: slot.query,
    slotId: slot.id,
    limit: slot.limit
  }));
}
