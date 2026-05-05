import type { PoiSeed } from "./types";

export const supportedCities = ["上海", "杭州", "苏州", "成都"];

export const fallbackPois: PoiSeed[] = [
  {
    id: "sha-wukang-road",
    city: "上海",
    name: "武康路",
    tags: ["street", "walkable", "photo", "coffee"],
    lat: 31.2058,
    lng: 121.4378,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "sha-west-bund",
    city: "上海",
    name: "西岸滨江",
    tags: ["riverside", "walkable", "photo", "free"],
    lat: 31.1844,
    lng: 121.4593,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "sha-power-station",
    city: "上海",
    name: "上海当代艺术博物馆",
    tags: ["indoor", "culture", "exhibition", "rain_friendly"],
    lat: 31.2037,
    lng: 121.4833,
    costLevel: 2,
    indoor: true,
    openingHours: "11:00-19:00"
  },
  {
    id: "sha-yuyuan",
    city: "上海",
    name: "豫园",
    tags: ["landmark", "classic", "culture", "local_food"],
    lat: 31.2272,
    lng: 121.4921,
    costLevel: 2,
    indoor: false,
    openingHours: "09:00-21:00"
  },
  {
    id: "sha-anfu-road",
    city: "上海",
    name: "安福路",
    tags: ["street", "coffee", "bookstore", "walkable"],
    lat: 31.2142,
    lng: 121.4431,
    costLevel: 2,
    indoor: false,
    openingHours: "10:00-22:00"
  },
  {
    id: "sha-bund-night",
    city: "上海",
    name: "外滩夜景",
    tags: ["night", "riverside", "landmark", "photo", "free"],
    lat: 31.24,
    lng: 121.49,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "hgh-west-lake",
    city: "杭州",
    name: "西湖湖滨",
    tags: ["landmark", "riverside", "walkable", "classic", "free"],
    lat: 30.2589,
    lng: 120.1303,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "hgh-china-academy",
    city: "杭州",
    name: "中国美术学院象山校区",
    tags: ["culture", "photo", "rain_friendly", "walkable"],
    lat: 30.1601,
    lng: 120.0783,
    costLevel: 1,
    indoor: true,
    openingHours: "09:00-17:00"
  },
  {
    id: "hgh-hefang",
    city: "杭州",
    name: "河坊街",
    tags: ["street", "local_food", "snack", "walkable"],
    lat: 30.2468,
    lng: 120.1688,
    costLevel: 1,
    indoor: false,
    openingHours: "10:00-22:00"
  },
  {
    id: "hgh-tea-museum",
    city: "杭州",
    name: "中国茶叶博物馆",
    tags: ["indoor", "culture", "rain_friendly", "low_budget"],
    lat: 30.2376,
    lng: 120.0991,
    costLevel: 1,
    indoor: true,
    openingHours: "09:00-17:00"
  },
  {
    id: "hgh-qinghefang-night",
    city: "杭州",
    name: "清河坊夜逛",
    tags: ["night", "street", "food", "snack"],
    lat: 30.2474,
    lng: 120.1712,
    costLevel: 1,
    indoor: false,
    openingHours: "10:00-22:30"
  },
  {
    id: "hgh-bookstore",
    city: "杭州",
    name: "晓风书屋",
    tags: ["bookstore", "indoor", "coffee", "rain_friendly"],
    lat: 30.2744,
    lng: 120.1551,
    costLevel: 2,
    indoor: true,
    openingHours: "10:00-21:00"
  },
  {
    id: "suz-pingjiang",
    city: "苏州",
    name: "平江路",
    tags: ["street", "walkable", "classic", "photo"],
    lat: 31.3156,
    lng: 120.6306,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "suz-museum",
    city: "苏州",
    name: "苏州博物馆",
    tags: ["indoor", "culture", "rain_friendly", "classic"],
    lat: 31.3242,
    lng: 120.6269,
    costLevel: 1,
    indoor: true,
    openingHours: "09:00-17:00"
  },
  {
    id: "suz-jinji-lake",
    city: "苏州",
    name: "金鸡湖夜景",
    tags: ["night", "riverside", "photo", "free"],
    lat: 31.3069,
    lng: 120.7063,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "cd-kuanzhai",
    city: "成都",
    name: "宽窄巷子",
    tags: ["classic", "street", "local_food", "walkable"],
    lat: 30.6762,
    lng: 104.0568,
    costLevel: 1,
    indoor: false,
    openingHours: "全天开放"
  },
  {
    id: "cd-dongjiao",
    city: "成都",
    name: "东郊记忆",
    tags: ["photo", "exhibition", "walkable", "coffee"],
    lat: 30.6712,
    lng: 104.1266,
    costLevel: 1,
    indoor: true,
    openingHours: "10:00-22:00"
  },
  {
    id: "cd-taikoo-li",
    city: "成都",
    name: "太古里夜逛",
    tags: ["night", "food", "walkable", "photo"],
    lat: 30.6525,
    lng: 104.0809,
    costLevel: 2,
    indoor: false,
    openingHours: "10:00-22:00"
  }
];
