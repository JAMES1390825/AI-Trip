import { generateRealRouteCard } from "./real-route-planner";
import type { RouteCard, RouteCardRequest } from "./types";

export type ReviseRouteCardInput = {
  routeCard: RouteCard;
  reviseNote: string;
};

export type ReviseRouteCardDeps = {
  planner?: (request: RouteCardRequest) => Promise<RouteCard>;
};

function buildRevisionNote(routeCard: RouteCard, reviseNote: string): string {
  const stops = routeCard.stops.map((stop) => stop.poi).join(" -> ");
  const originalIntent = routeCard.intentSummary || routeCard.fitFor;
  return [
    `原路线意图：${originalIntent}`,
    `当前路线节点：${stops}`,
    `用户调整要求：${reviseNote}`,
    "请基于调整要求重新编排路线。优先保留真实可走性，必要时替换候选点。"
  ].join("\n");
}

export async function reviseRouteCard(input: ReviseRouteCardInput, deps: ReviseRouteCardDeps = {}): Promise<RouteCard> {
  const reviseNote = input.reviseNote.trim();
  if (!reviseNote) throw new Error("reviseNote is required");
  const planner = deps.planner || generateRealRouteCard;
  const request: RouteCardRequest = {
    city: input.routeCard.city,
    themeId: input.routeCard.themeId,
    startDate: input.routeCard.startDate,
    durationDays: input.routeCard.durationDays,
    note: buildRevisionNote(input.routeCard, reviseNote)
  };
  const revised = await planner(request);
  return {
    ...revised,
    revisionNote: reviseNote,
    revisionSummary: `已根据「${reviseNote}」重新调整路线。`
  };
}
