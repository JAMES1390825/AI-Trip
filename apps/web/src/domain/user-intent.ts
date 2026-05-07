import type { CompanionType, RouteThemeId, RouteCardRequest, TransportPreference, TripPreferenceId } from "./types";

export type TravelerProfile = "solo" | "couple" | "friends" | "family" | "parents" | "kids" | "unknown";
export type PhysicalPace = "relaxed" | "normal" | "packed" | "low_walking" | "unknown";
export type BudgetPosture = "low" | "normal" | "flexible" | "unknown";
export type StartRhythm = "early_start" | "late_start" | "afternoon_start" | "night_first" | "unknown";

export type InterestWeights = {
  classic: number;
  photo: number;
  food: number;
  coffee: number;
  shopping: number;
  culture: number;
  nature: number;
  nightlife: number;
  rainSafety: number;
};

export type UserIntent = {
  travelerProfile: TravelerProfile;
  physicalPace: PhysicalPace;
  budgetPosture: BudgetPosture;
  startRhythm: StartRhythm;
  interestWeights: InterestWeights;
  mustHaveConstraints: string[];
  importedTextHints: string[];
  avoidConstraints: string[];
  confidence: number;
  intentSummary: string;
};

export type IntentInput = {
  themeId: RouteThemeId;
  note: string;
  tripPreferences?: TripPreferenceId[];
  importedText?: string;
  companion?: CompanionType;
  transportPreference?: TransportPreference;
  budgetRange?: RouteCardRequest["budgetRange"];
  mustVisitText?: string;
  avoidText?: string;
};

const baseWeights: InterestWeights = {
  classic: 1,
  photo: 1,
  food: 1,
  coffee: 1,
  shopping: 0,
  culture: 1,
  nature: 1,
  nightlife: 0,
  rainSafety: 0
};

function withThemeWeights(themeId: RouteThemeId): InterestWeights {
  const weights = { ...baseWeights };
  if (themeId === "classic") weights.classic += 3;
  if (themeId === "easy_citywalk") {
    weights.photo += 2;
    weights.coffee += 1;
  }
  if (themeId === "rain_backup") rainSafe(weights);
  if (themeId === "food_linked") weights.food += 3;
  if (themeId === "night_half_day") weights.nightlife += 3;
  if (themeId === "low_budget") weights.nature += 1;
  return weights;
}

function rainSafe(weights: InterestWeights) {
  weights.rainSafety += 3;
  weights.culture += 1;
  weights.coffee += 1;
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

function splitConstraintText(value?: string): string[] {
  return (value || "")
    .split(/[，,、\n；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function inferUserIntent(input: IntentInput): UserIntent {
  const note = input.note.trim();
  const weights = withThemeWeights(input.themeId);
  const preferences = input.tripPreferences || [];
  const importedText = (input.importedText || "").trim();
  const mustHaveConstraints: string[] = [];
  const importedTextHints: string[] = [];
  const avoidConstraints: string[] = [];

  if (includesAny(note, ["拍照", "出片", "photo"])) weights.photo += 3;
  if (includesAny(note, ["吃", "小吃", "美食"])) weights.food += 3;
  if (includesAny(note, ["咖啡", "coffee"])) weights.coffee += 3;
  if (includesAny(note, ["雨", "下雨"])) rainSafe(weights);
  if (includesAny(note, ["夜", "夜景", "晚上"])) weights.nightlife += 2;

  if (preferences.includes("拍照出片")) weights.photo += 3;
  if (preferences.includes("吃喝逛")) weights.food += 3;
  if (preferences.includes("历史古迹") || preferences.includes("文艺展览")) weights.culture += 3;
  if (preferences.includes("自然风光")) weights.nature += 3;
  if (preferences.includes("室内备选")) rainSafe(weights);
  if (preferences.includes("预算友好")) weights.nature += 1;
  if (preferences.includes("小众探索")) weights.classic -= 0.5;
  if (preferences.includes("citywalk")) {
    weights.photo += 1;
    weights.coffee += 1;
  }

  const travelerProfile: TravelerProfile = input.companion === "elderly" || includesAny(note, ["爸妈", "父母", "老人"])
    ? "parents"
    : input.companion === "family" || preferences.includes("亲子") || includesAny(note, ["孩子", "小孩", "亲子"])
      ? "kids"
      : input.companion === "friends" || includesAny(note, ["朋友", "闺蜜", "同学"])
        ? "friends"
        : "unknown";

  const physicalPace: PhysicalPace = preferences.includes("少走路") || includesAny(note, ["少走", "少走路"])
    ? "low_walking"
    : includesAny(note, ["轻松", "别太累", "不赶", "不要太赶"])
      ? "relaxed"
      : includesAny(note, ["多逛", "充实", "特种兵"])
        ? "packed"
        : input.themeId === "easy_citywalk"
          ? "relaxed"
          : "normal";

  const budgetPosture: BudgetPosture = input.budgetRange === "budget_friendly" || includesAny(note, ["预算低", "省钱", "低预算"])
    ? "low"
    : input.budgetRange === "flexible"
      ? "flexible"
      : input.themeId === "low_budget"
      ? "low"
      : "normal";

  const startRhythm: StartRhythm = includesAny(note, ["下午"])
    ? "afternoon_start"
    : includesAny(note, ["晚上", "夜"])
      ? "night_first"
      : includesAny(note, ["早起", "一早"])
        ? "early_start"
        : "unknown";

  if (includesAny(note, ["带爸妈", "预算低", "拍照", "咖啡", "小吃"])) {
    for (const phrase of ["带爸妈", "预算低", "拍照", "咖啡", "小吃"]) {
      if (note.includes(phrase)) mustHaveConstraints.push(phrase);
    }
  }
  if (includesAny(note, ["别太累", "少走路", "不赶"])) {
    for (const phrase of ["别太累", "少走路", "不赶"]) {
      if (note.includes(phrase)) avoidConstraints.push(phrase);
    }
  }
  if (importedText) importedTextHints.push(importedText.slice(0, 120));
  mustHaveConstraints.push(...splitConstraintText(input.mustVisitText).map((item) => `必去：${item}`));
  avoidConstraints.push(...splitConstraintText(input.avoidText).map((item) => `避开/注意：${item}`));
  if (input.budgetRange === "budget_friendly") mustHaveConstraints.push("预算友好优先");
  if (input.budgetRange === "flexible") mustHaveConstraints.push("体验优先，可接受更高预算");
  if (input.companion === "family") mustHaveConstraints.push("亲子友好节奏");
  if (input.companion === "elderly") mustHaveConstraints.push("照顾长辈体力");
  if (input.companion === "couple") mustHaveConstraints.push("适合情侣同行");
  if (input.companion === "solo") mustHaveConstraints.push("适合独自出行");
  if (preferences.includes("亲子")) mustHaveConstraints.push("适合亲子同行");
  if (preferences.includes("室内备选")) mustHaveConstraints.push("保留室内备选");
  if (input.transportPreference === "walk_first") avoidConstraints.push("步行优先但避免连续长距离暴走");
  if (input.transportPreference === "public_transit_ok") {
    mustHaveConstraints.push("公共交通可达");
    avoidConstraints.push("优先公共交通可达");
  }
  if (input.transportPreference === "taxi_ok") avoidConstraints.push("可用打车减少换乘");

  const summaryParts: string[] = [];
  if (physicalPace === "relaxed" || physicalPace === "low_walking") summaryParts.push("轻松");
  if (weights.photo >= 4) summaryParts.push("拍照友好");
  if (weights.food >= 4) summaryParts.push("美食优先");
  if (budgetPosture === "low") summaryParts.push("低预算");
  if (travelerProfile === "parents") summaryParts.push("照顾爸妈体力");

  return {
    travelerProfile,
    physicalPace,
    budgetPosture,
    startRhythm,
    interestWeights: weights,
    mustHaveConstraints,
    importedTextHints,
    avoidConstraints,
    confidence: note ? 0.74 : 0.52,
    intentSummary: summaryParts.length ? summaryParts.join("，") : "按主题生成基础路线"
  };
}
