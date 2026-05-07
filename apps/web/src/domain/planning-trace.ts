import type { PlanningTraceEvent, PlanningTraceNodeId, PlanningTraceStatus } from "./types";

export const planningTraceNodes: { id: PlanningTraceNodeId; label: string }[] = [
  { id: "intent_agent", label: "理解旅行需求" },
  { id: "research_planner", label: "制定搜索策略" },
  { id: "poi_search_agent", label: "高德检索真实地点" },
  { id: "evidence_agent", label: "Exa 查找公开攻略证据" },
  { id: "route_architect_agent", label: "路线架构 Agent 编排" },
  { id: "critic_agent", label: "Critic Agent 校验路线" },
  { id: "repair_agent", label: "Repair Agent 修复弱点" },
  { id: "pretrip_agent", label: "生成行前提醒" },
  { id: "composer", label: "输出地图 + 每日行程" }
];

export function createQueuedPlanningTrace(): PlanningTraceEvent[] {
  return planningTraceNodes.map((node) => ({
    nodeId: node.id,
    label: node.label,
    status: "queued"
  }));
}

export function markTraceNode(
  trace: PlanningTraceEvent[],
  nodeId: PlanningTraceNodeId,
  status: PlanningTraceStatus,
  detail?: string,
): PlanningTraceEvent[] {
  const now = new Date().toISOString();
  return mergeCompletedPlanningTrace(trace).map((event) => {
    if (event.nodeId !== nodeId) return event;
    return {
      ...event,
      status,
      detail: detail ?? event.detail,
      startedAt: event.startedAt || now,
      finishedAt: status === "queued" || status === "active" ? event.finishedAt : now
    };
  });
}

export function mergeCompletedPlanningTrace(trace: PlanningTraceEvent[]): PlanningTraceEvent[] {
  const byNode = new Map(trace.map((event) => [event.nodeId, event]));
  return planningTraceNodes.map((node) => byNode.get(node.id) || { nodeId: node.id, label: node.label, status: "queued" });
}
