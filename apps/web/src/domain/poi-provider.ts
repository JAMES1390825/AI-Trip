import { fallbackPois, supportedCities } from "./fallback-data";
import type { PoiSeed } from "./types";

export type PoiProvider = {
  getSupportedCities(): string[];
  getPois(city: string): PoiSeed[];
  getSourceLabel(): string;
};

export const fallbackPoiProvider: PoiProvider = {
  getSupportedCities() {
    return supportedCities;
  },
  getPois(city) {
    const cityPois = fallbackPois.filter((poi) => poi.city === city);
    return cityPois.length >= 3 ? cityPois : fallbackPois.filter((poi) => poi.city === "上海");
  },
  getSourceLabel() {
    return "本地示例数据";
  }
};
