import type { RouteThemeId, TripPreferenceId } from "./types";

type ThemeInferenceInput = {
  note?: string;
  importedText?: string;
  tripPreferences?: TripPreferenceId[];
};

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word.toLowerCase()));
}

export function inferRouteThemeId(input: ThemeInferenceInput): RouteThemeId {
  const preferences = input.tripPreferences || [];
  const text = `${input.note || ""} ${input.importedText || ""}`.toLowerCase();

  if (preferences.includes("室内备选") || includesAny(text, ["下雨", "雨天", "室内", "博物馆", "展览"])) {
    return "rain_backup";
  }

  if (preferences.includes("预算友好") || includesAny(text, ["预算", "省钱", "少花钱", "低预算", "免费"])) {
    return "low_budget";
  }

  if (includesAny(text, ["下午到", "下午出发", "半日", "夜景", "晚上", "夜游"])) {
    return "night_half_day";
  }

  if (
    preferences.includes("吃喝逛") ||
    includesAny(text, ["吃", "小吃", "美食", "餐厅", "咖啡", "夜市", "brunch"])
  ) {
    return "food_linked";
  }

  if (
    preferences.some((preference) => ["citywalk", "小众探索", "拍照出片", "文艺展览", "少走路"].includes(preference)) ||
    includesAny(text, ["citywalk", "慢慢走", "别太累", "少走路", "拍照", "出片", "小众", "书店"])
  ) {
    return "easy_citywalk";
  }

  return "classic";
}
