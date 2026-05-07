import type { TripImportDraft, TripPreferenceId } from "./types";

const supportedCities = ["上海", "杭州", "苏州", "成都"];
const maxImportTextLength = 800;
const stopWords = [
  "周六",
  "周日",
  "周末",
  "下午到",
  "上午到",
  "晚上到",
  "朋友推荐",
  "推荐",
  "收藏了",
  "想去",
  "必去",
  "最后到",
  "最后",
  "出发",
  "开始"
];
const nonPlaceTokens = new Set(["citywalk", "Citywalk", "拍照", "小吃", "美食", "亲子", "预算友好", "室内", "雨天"]);

const preferenceMatchers: Array<{ preference: TripPreferenceId; words: string[] }> = [
  { preference: "经典必玩", words: ["经典", "必玩", "第一次"] },
  { preference: "吃喝逛", words: ["吃", "小吃", "美食", "餐厅"] },
  { preference: "亲子", words: ["亲子", "孩子", "小孩"] },
  { preference: "citywalk", words: ["citywalk", "Citywalk", "步行", "慢逛"] },
  { preference: "历史古迹", words: ["历史", "古迹", "寺", "老街"] },
  { preference: "小众探索", words: ["小众", "人少", "冷门"] },
  { preference: "拍照出片", words: ["拍照", "出片", "机位"] },
  { preference: "自然风光", words: ["自然", "公园", "湖", "山"] },
  { preference: "文艺展览", words: ["展览", "美术馆", "博物馆", "艺术"] },
  { preference: "室内备选", words: ["室内", "雨天", "下雨"] },
  { preference: "少走路", words: ["少走路", "别太累", "不要太累", "不赶", "别太赶"] },
  { preference: "预算友好", words: ["预算", "省钱", "便宜", "免费"] }
];

function normalizeText(rawText: string): string {
  return rawText.trim().replace(/\s+/g, " ").slice(0, maxImportTextLength);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function cleanPlaceCandidate(value: string): string {
  let result = value.trim();
  for (const word of stopWords) {
    result = result.replaceAll(word, "");
  }
  result = result
    .replace(/^[：:，,、\s]+/, "")
    .replace(/[：:，,、\s]+$/, "")
    .replace(/^(从|到|去|和|以及|然后|再|先|在)/, "")
    .replace(/(附近|左右|那边|这里|那里)$/, "")
    .trim();
  return result;
}

function hasAvoidSignal(value: string): boolean {
  return ["不要", "别", "避开", "少排队", "少走路", "别太累", "不要太累", "不赶", "别太赶"].some((word) => value.includes(word));
}

function extractCity(text: string): string | undefined {
  return supportedCities.find((city) => text.includes(city));
}

function extractEndpoint(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match?.[1]?.trim();
}

function extractPreferences(text: string): TripPreferenceId[] {
  return preferenceMatchers
    .filter(({ words }) => words.some((word) => text.includes(word)))
    .map(({ preference }) => preference);
}

function extractAvoidItems(text: string): string[] {
  return text
    .split(/[。.!！?\n；;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && hasAvoidSignal(part))
    .slice(0, 4);
}

function extractPlaces(text: string, cityHint?: string, startPointHint?: string, endPointHint?: string): string[] {
  const avoidItems = new Set(extractAvoidItems(text));
  const pieces = text
    .replace(/[。.!！?\n；;]/g, "，")
    .split(/(?:->|→|，|,|、|\s)+/)
    .map(cleanPlaceCandidate)
    .filter(Boolean)
    .filter((part) => part.length >= 2 && part.length <= 12)
    .filter((part) => part !== cityHint)
    .filter((part) => part !== startPointHint)
    .filter((part) => part !== endPointHint)
    .filter((part) => !nonPlaceTokens.has(part))
    .filter((part) => !avoidItems.has(part))
    .filter((part) => !hasAvoidSignal(part))
    .filter((part) => !/^\d+$/.test(part))
    .filter((part) => !/^(想|尽量|预算|雨天|两日|一日|半日)/.test(part));

  return unique(pieces).slice(0, 8);
}

function confidenceFor(draft: Pick<TripImportDraft, "cityHint" | "placeNames" | "avoidText" | "preferenceHints">): number {
  if (!draft.cityHint && !draft.placeNames.length && !draft.avoidText && !draft.preferenceHints.length) return 0.18;
  const score =
    0.32 +
    (draft.cityHint ? 0.14 : 0) +
    Math.min(0.28, draft.placeNames.length * 0.08) +
    (draft.avoidText ? 0.1 : 0) +
    Math.min(0.16, draft.preferenceHints.length * 0.04);
  return Math.round(Math.min(0.92, score) * 100) / 100;
}

export function parseTripImportText(rawText: string): TripImportDraft {
  const text = normalizeText(rawText);
  if (!text) {
    return {
      rawText: "",
      placeNames: [],
      preferenceHints: [],
      confidence: 0,
      parseNotes: ["粘贴朋友发来的地点、攻略片段或旧行程后，可以先识别成规划草稿。"]
    };
  }

  const cityHint = extractCity(text);
  const startPointHint = extractEndpoint(text, /从([^，,。；;\s]+)出发/);
  const endPointHint = extractEndpoint(text, /(?:最后到|结束在|到达)([^，,。；;\s]+)/);
  const placeNames = extractPlaces(text, cityHint, startPointHint, endPointHint);
  const avoidItems = extractAvoidItems(text);
  const preferenceHints = unique(extractPreferences(text));
  const parseNotes = [
    cityHint ? `识别到城市：${cityHint}` : "未识别到明确城市，可手动选择。",
    placeNames.length ? `识别到 ${placeNames.length} 个地点线索。` : "未识别到明确地点，可继续补充。",
    avoidItems.length ? "识别到避开或节奏约束。" : "未识别到明显避开约束。"
  ];

  return {
    rawText: text,
    cityHint,
    placeNames,
    mustVisitText: placeNames.length ? placeNames.join("、") : undefined,
    avoidText: avoidItems.length ? avoidItems.join("；") : undefined,
    noteHint: text.slice(0, 160),
    preferenceHints,
    startPointHint,
    endPointHint,
    confidence: confidenceFor({
      cityHint,
      placeNames,
      avoidText: avoidItems.join("；"),
      preferenceHints
    }),
    parseNotes
  };
}
