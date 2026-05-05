import type { RouteThemeId } from "./types";

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
  avoidConstraints: string[];
  confidence: number;
  intentSummary: string;
};

export type IntentInput = {
  themeId: RouteThemeId;
  note: string;
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

export function inferUserIntent(input: IntentInput): UserIntent {
  const note = input.note.trim();
  const weights = withThemeWeights(input.themeId);
  const mustHaveConstraints: string[] = [];
  const avoidConstraints: string[] = [];

  if (includesAny(note, ["拍照", "出片", "photo"])) weights.photo += 3;
  if (includesAny(note, ["吃", "小吃", "美食"])) weights.food += 3;
  if (includesAny(note, ["咖啡", "coffee"])) weights.coffee += 3;
  if (includesAny(note, ["雨", "下雨"])) rainSafe(weights);
  if (includesAny(note, ["夜", "夜景", "晚上"])) weights.nightlife += 2;

  const travelerProfile: TravelerProfile = includesAny(note, ["爸妈", "父母", "老人"])
    ? "parents"
    : includesAny(note, ["孩子", "小孩", "亲子"])
      ? "kids"
      : includesAny(note, ["朋友", "闺蜜", "同学"])
        ? "friends"
        : "unknown";

  const physicalPace: PhysicalPace = includesAny(note, ["少走", "少走路"])
    ? "low_walking"
    : includesAny(note, ["轻松", "别太累", "不赶"])
      ? "relaxed"
      : includesAny(note, ["多逛", "充实", "特种兵"])
        ? "packed"
        : input.themeId === "easy_citywalk"
          ? "relaxed"
          : "normal";

  const budgetPosture: BudgetPosture = includesAny(note, ["预算低", "省钱", "低预算"])
    ? "low"
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
    avoidConstraints,
    confidence: note ? 0.74 : 0.52,
    intentSummary: summaryParts.length ? summaryParts.join("，") : "按主题生成基础路线"
  };
}
