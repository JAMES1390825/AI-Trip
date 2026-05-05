import type { RouteTheme, RouteThemeId } from "./types";

export const routeThemes: RouteTheme[] = [
  {
    id: "classic",
    label: "经典初游路线",
    promise: "第一次来这座城市，先把最值得逛的核心片区串起来。",
    primaryTags: ["landmark", "culture", "walkable"],
    styleTags: ["photo", "local_food", "riverside"],
    avoidTags: [],
    defaultDurationDays: 1
  },
  {
    id: "easy_citywalk",
    label: "轻松 citywalk",
    promise: "少赶路、好逛好拍，适合周末慢慢走。",
    primaryTags: ["walkable", "street", "relaxed"],
    styleTags: ["coffee", "photo", "bookstore", "riverside"],
    avoidTags: ["long_transfer"],
    defaultDurationDays: 1
  },
  {
    id: "rain_backup",
    label: "雨天备选路线",
    promise: "天气不好也能玩，优先室内和可快速切换的点位。",
    primaryTags: ["indoor", "culture", "rain_friendly"],
    styleTags: ["exhibition", "coffee", "bookstore"],
    avoidTags: ["outdoor_only"],
    defaultDurationDays: 1
  },
  {
    id: "food_linked",
    label: "美食串联路线",
    promise: "把本地小吃、正餐和附近可逛片区串成一条线。",
    primaryTags: ["local_food", "snack", "walkable"],
    styleTags: ["coffee", "night", "market"],
    avoidTags: [],
    defaultDurationDays: 1
  },
  {
    id: "night_half_day",
    label: "夜景半日路线",
    promise: "下午出发，晚上用夜景和好吃的收束。",
    primaryTags: ["night", "riverside", "food"],
    styleTags: ["photo", "bar", "city_lights"],
    avoidTags: ["early_close"],
    defaultDurationDays: 1
  },
  {
    id: "low_budget",
    label: "低预算路线",
    promise: "少花钱也不无聊，优先免费景观、街区和实惠吃法。",
    primaryTags: ["free", "walkable", "budget_food"],
    styleTags: ["park", "street", "local_food"],
    avoidTags: ["expensive"],
    defaultDurationDays: 1
  }
];

export function getRouteTheme(themeId: string): RouteTheme {
  return routeThemes.find((theme) => theme.id === themeId) || routeThemes[0];
}

export function isRouteThemeId(value: string): value is RouteThemeId {
  return routeThemes.some((theme) => theme.id === value);
}
