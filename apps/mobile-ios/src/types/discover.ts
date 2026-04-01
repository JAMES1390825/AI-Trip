export type DiscoverDraftSeed = {
  source: "search" | "topic" | "nearby";
  destination?: string;
  keyword?: string;
  mustGo?: string[];
  travelStyles?: string[];
};
