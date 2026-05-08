"use client";

import { useEffect, useState, useTransition } from "react";
import { createQueuedPlanningTrace, mergeCompletedPlanningTrace } from "@/domain/planning-trace";
import { inferRouteThemeId } from "@/domain/theme-inference";
import { deriveTripDates } from "@/domain/trip-dates";
import { parseTripImportText } from "@/domain/trip-import-parser";
import type {
  BudgetRange,
  CompanionType,
  PlanningTraceEvent,
  RouteCard as RouteCardData,
  SavedRouteCardSummary,
  TransportPreference,
  TripImportDraft,
  TripPreferenceId
} from "@/domain/types";
import { RouteCard } from "./RouteCard";
import type { StopAction } from "./RouteInteractiveMap";
import { PosterShareCard } from "./share/PosterShareCard";
import { StoryShareCard } from "./share/StoryShareCard";

type ShareMode = "poster" | "story";
type PlanningStageState = PlanningTraceEvent["status"];
export type RoutePlannerAppProps = {
  initialCreateMode?: "new" | "import";
};

const cityOptions = ["上海", "杭州", "苏州", "成都"];
const budgetOptions: { id: BudgetRange; label: string }[] = [
  { id: "budget_friendly", label: "预算友好" },
  { id: "balanced", label: "均衡舒适" },
  { id: "flexible", label: "体验优先" }
];
const companionOptions: { id: CompanionType; label: string }[] = [
  { id: "solo", label: "独自出行" },
  { id: "friends", label: "朋友同行" },
  { id: "couple", label: "情侣出行" },
  { id: "family", label: "亲子家庭" },
  { id: "elderly", label: "带长辈" }
];
const transportOptions: { id: TransportPreference; label: string }[] = [
  { id: "walk_first", label: "优先步行" },
  { id: "public_transit_ok", label: "公交地铁可接受" },
  { id: "taxi_ok", label: "可打车衔接" }
];
const revisionQuickActions = ["少走路", "加吃饭点", "下雨改室内", "更省钱", "去掉寺庙", "压缩成半日"];
const preferenceOptions: TripPreferenceId[] = [
  "经典必玩",
  "吃喝逛",
  "亲子",
  "citywalk",
  "历史古迹",
  "小众探索",
  "拍照出片",
  "自然风光",
  "文艺展览",
  "室内备选",
  "少走路",
  "预算友好"
];
const planningTraceTemplate = createQueuedPlanningTrace();
const asyncPlanningPreflightStages = [
  {
    id: "create_planning_job",
    label: "创建规划任务",
    detail: "把你的旅行需求写入 PostgreSQL PlanningJob"
  },
  {
    id: "poll_planning_job",
    label: "轮询任务结果",
    detail: "等待规划大脑写回路线和进度"
  }
];
const planningStageCount = asyncPlanningPreflightStages.length + planningTraceTemplate.length;

function planningStageStatusLabel(state: PlanningStageState): string {
  if (state === "active") return "进行中";
  if (state === "done") return "已完成";
  if (state === "warning") return "需确认";
  if (state === "error") return "需重试";
  return "等待开始";
}

function normalizePlanningTrace(trace?: PlanningTraceEvent[]): PlanningTraceEvent[] {
  return trace?.length ? mergeCompletedPlanningTrace(trace) : createQueuedPlanningTrace();
}

function routeCardFromPlanningJob(job: PlanningJobResponse): RouteCardData | null {
  const resultPayload = job.resultPayload;
  if (!resultPayload || typeof resultPayload !== "object") return null;
  const routeCard = (resultPayload as { routeCard?: unknown }).routeCard;
  if (!routeCard || typeof routeCard !== "object") return null;
  return routeCard as RouteCardData;
}

function planningTraceFromPlanningJob(job: PlanningJobResponse): PlanningTraceEvent[] | undefined {
  const resultPayload = job.resultPayload;
  if (!resultPayload || typeof resultPayload !== "object") return undefined;
  const planningTrace = (resultPayload as { planningTrace?: unknown }).planningTrace;
  return Array.isArray(planningTrace) ? planningTrace as PlanningTraceEvent[] : undefined;
}

type PlanningJobResponse = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  resultPayload?: unknown;
  errorCode?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload.message || "请求失败"));
  }
  return response.json() as Promise<T>;
}

export function stopActionToReviseNote(action: StopAction): string {
  if (action.type === "replace") return `替换「${action.stopName}」，保持路线真实可走。`;
  if (action.type === "delete") return `删除「${action.stopName}」，并重新连接前后路线。`;
  if (action.type === "add_food_before") return `在「${action.stopName}」前面加一个真实可达的吃饭点。`;
  if (action.type === "add_rest_after") return `在「${action.stopName}」后面加一个适合休息的点。`;
  if (action.type === "make_indoor") return `把「${action.stopName}」替换成室内或雨天更稳的点。`;
  return `优化「${action.stopName}」附近路线，减少步行距离。`;
}

export function reorderedStopsToReviseNote(stops: RouteCardData["stops"]): string {
  return `用户拖拽调整了当天顺序，请优先按这个顺序重新校验路线时间：${stops.map((stop) => stop.poi).join(" -> ")}`;
}

export function RoutePlannerApp(props: RoutePlannerAppProps = {}) {
  const { initialCreateMode = "new" } = props;
  const [city, setCity] = useState("杭州");
  const [startDate, setStartDate] = useState("2026-05-10");
  const [endDate, setEndDate] = useState("2026-05-10");
  const [note, setNote] = useState("想拍照，别太累");
  const [activeCreateMode, setActiveCreateMode] = useState<"new" | "import">(initialCreateMode);
  const [tripPreferences, setTripPreferences] = useState<TripPreferenceId[]>(["拍照出片", "少走路"]);
  const [importedText, setImportedText] = useState("");
  const [importDraft, setImportDraft] = useState<TripImportDraft | null>(parseTripImportText(""));
  const [budgetRange, setBudgetRange] = useState<BudgetRange>("balanced");
  const [companion, setCompanion] = useState<CompanionType>("friends");
  const [transportPreference, setTransportPreference] = useState<TransportPreference>("walk_first");
  const [startPoint, setStartPoint] = useState("");
  const [endPoint, setEndPoint] = useState("");
  const [mustVisitText, setMustVisitText] = useState("");
  const [avoidText, setAvoidText] = useState("少走路，不要太赶");
  const [revisionNote, setRevisionNote] = useState("少走路一点，加一个吃饭点");
  const [routeCard, setRouteCard] = useState<RouteCardData | null>(null);
  const [saved, setSaved] = useState<SavedRouteCardSummary[]>([]);
  const [routeSeed, setRouteSeed] = useState("initial");
  const [status, setStatus] = useState("选择城市、日期和偏好，生成你的第一份真实旅行计划。");
  const [shareMode, setShareMode] = useState<ShareMode>("poster");
  const [planningTrace, setPlanningTrace] = useState<PlanningTraceEvent[]>(() => createQueuedPlanningTrace());
  const [planningStageIndex, setPlanningStageIndex] = useState(-1);
  const [planningStageError, setPlanningStageError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inferredThemeId = inferRouteThemeId({
    note: [note, mustVisitText, avoidText].filter(Boolean).join("，"),
    importedText: activeCreateMode === "import" ? importedText : undefined,
    tripPreferences
  });
  const tripDates = deriveTripDates(startDate, endDate);

  async function loadSaved() {
    const payload = await readJson<{ items: SavedRouteCardSummary[] }>(await fetch("/api/route-cards"));
    setSaved(payload.items);
  }

  useEffect(() => {
    void loadSaved().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  function togglePreference(preference: TripPreferenceId) {
    setTripPreferences((current) =>
      current.includes(preference) ? current.filter((item) => item !== preference) : [...current, preference],
    );
  }

  function appendFieldValue(current: string, next?: string): string {
    const trimmedNext = (next || "").trim();
    if (!trimmedNext) return current;
    const trimmedCurrent = current.trim();
    if (!trimmedCurrent) return trimmedNext;
    if (trimmedCurrent.includes(trimmedNext)) return trimmedCurrent;
    return `${trimmedCurrent}，${trimmedNext}`;
  }

  function planningStageState(index: number): PlanningStageState {
    if (planningStageError && index === Math.min(planningStageIndex, planningStageCount - 1)) return "error";
    if (planningStageIndex >= planningStageCount || index < planningStageIndex) return "done";
    if (index === planningStageIndex) return "active";
    return "queued";
  }

  function displayedPlanningTrace(): PlanningTraceEvent[] {
    if (!isPending && !planningStageError) return planningTrace;
    return planningTraceTemplate.map((event, index) => ({
      ...event,
      status: planningStageState(index + asyncPlanningPreflightStages.length)
    }));
  }

  function parseImportedText() {
    const draft = parseTripImportText(importedText);
    setImportDraft(draft);
    if (!draft.rawText) {
      setStatus("先粘贴朋友发来的地点清单、旧行程或攻略片段，再识别。");
      return;
    }
    setStatus(`已识别导入内容：${draft.placeNames.length} 个地点线索，${Math.round(draft.confidence * 100)}% 草稿可信度。`);
  }

  function applyImportDraft() {
    if (!importDraft || !importDraft.rawText) {
      setStatus("请先识别导入内容，再应用到规划表单。");
      return;
    }

    if (importDraft.cityHint && cityOptions.includes(importDraft.cityHint)) setCity(importDraft.cityHint);
    if (importDraft.startPointHint) setStartPoint(importDraft.startPointHint);
    if (importDraft.endPointHint) setEndPoint(importDraft.endPointHint);
    setTripPreferences((current) => Array.from(new Set([...current, ...importDraft.preferenceHints])));
    setMustVisitText((current) => appendFieldValue(current, importDraft.mustVisitText));
    setAvoidText((current) => appendFieldValue(current, importDraft.avoidText));
    setNote((current) => appendFieldValue(current, importDraft.noteHint));
    setStatus("已应用导入草稿，可以继续微调后生成真实行程。");
  }

  function generate() {
    const currentTripDates = deriveTripDates(startDate, endDate);
    if (!currentTripDates) {
      setStatus("目前先支持 1-2 天行程，请确认结束日期不早于出发日期。");
      return;
    }
    startTransition(async () => {
      let progressTimer: number | undefined;
      try {
        setPlanningStageError(false);
        setPlanningStageIndex(0);
        setPlanningTrace(createQueuedPlanningTrace());
        setStatus("正在创建规划任务：写入 Job、执行规划大脑、轮询结果。");
        progressTimer = window.setInterval(() => {
          setPlanningStageIndex((current) => Math.min(current + 1, planningStageCount - 1));
        }, 520);
        const payload = await readJson<{ job: PlanningJobResponse }>(
          await fetch("/api/planning-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              runImmediately: true,
              request: {
                city,
                themeId: inferredThemeId,
                startDate: currentTripDates.startDate,
                endDate: currentTripDates.endDate,
                durationDays: currentTripDates.durationDays,
                note,
                routeSeed,
                tripPreferences,
                importedText: activeCreateMode === "import" ? importedText : undefined,
                budgetRange,
                companion,
                transportPreference,
                startPoint,
                endPoint,
                mustVisitText,
                avoidText
              }
            })
          }),
        );
        const nextRouteCard = routeCardFromPlanningJob(payload.job);
        if (!nextRouteCard || payload.job.status === "failed") {
          throw new Error(payload.job.errorCode || "规划任务未返回路线结果。");
        }
        if (progressTimer) window.clearInterval(progressTimer);
        const nextPlanningTrace = normalizePlanningTrace(planningTraceFromPlanningJob(payload.job) || nextRouteCard.planningTrace);
        setPlanningStageIndex(planningStageCount);
        setPlanningTrace(nextPlanningTrace);
        setRouteCard({ ...nextRouteCard, planningTrace: nextPlanningTrace });
        setRouteSeed(String(Date.now()));
        setStatus("真实行程已生成，可以继续编辑点位、重新校验或保存。");
      } catch (error) {
        if (progressTimer) window.clearInterval(progressTimer);
        setPlanningStageError(true);
        setPlanningStageIndex((current) => (current < 0 ? 0 : Math.min(current, planningStageCount - 1)));
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function applyRevisionQuickAction(action: string) {
    setRevisionNote((current) => (current.trim() ? `${current.trim()}，${action}` : action));
  }

  function reviseRoute() {
    if (!routeCard) {
      setStatus("请先生成一张路线卡，再调整路线。");
      return;
    }

    const trimmedRevisionNote = revisionNote.trim();
    if (!trimmedRevisionNote) {
      setStatus("请先写一句调整要求。");
      return;
    }

    startTransition(async () => {
      try {
        setStatus("正在根据你的要求调整路线...");
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards/revise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard, reviseNote: trimmedRevisionNote })
          }),
        );
        setRouteCard(payload.routeCard);
        setPlanningTrace(normalizePlanningTrace(payload.routeCard.planningTrace || planningTrace));
        setRevisionNote("");
        setStatus("已按要求调整路线，可以保存这一版。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function reviseWithNote(noteText: string) {
    const trimmedNote = noteText.trim();
    if (isPending) return;
    if (!routeCard) {
      setStatus("请先生成一张路线卡，再调整路线。");
      return;
    }
    if (!trimmedNote) {
      setStatus("请先写一句调整要求。");
      return;
    }

    setRevisionNote(trimmedNote);
    startTransition(async () => {
      try {
        setStatus("正在重新校验路线...");
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards/revise", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard, reviseNote: trimmedNote })
          }),
        );
        setRouteCard(payload.routeCard);
        setPlanningTrace(normalizePlanningTrace(payload.routeCard.planningTrace || planningTrace));
        setRevisionNote("");
        setStatus("已完成路线校验，可以继续编辑或保存。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function handleStopAction(action: StopAction) {
    reviseWithNote(stopActionToReviseNote(action));
  }

  function handleRevalidateOrder(stops: RouteCardData["stops"]) {
    reviseWithNote(reorderedStopsToReviseNote(stops));
  }

  function save() {
    if (!routeCard) return;
    startTransition(async () => {
      try {
        const payload = await readJson<{ routeCard: RouteCardData }>(
          await fetch("/api/route-cards", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routeCard })
          }),
        );
        setRouteCard(payload.routeCard);
        setPlanningTrace(normalizePlanningTrace(payload.routeCard.planningTrace || planningTrace));
        await loadSaved();
        setStatus("已保存路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function sharePathFor(card: RouteCardData): string {
    return `/share/${card.id}`;
  }

  function absoluteShareUrl(card: RouteCardData): string {
    if (typeof window === "undefined") return sharePathFor(card);
    return `${window.location.origin}${sharePathFor(card)}`;
  }

  async function copyShareLink(card: RouteCardData) {
    const url = absoluteShareUrl(card);
    try {
      await navigator.clipboard.writeText(url);
      setStatus("分享链接已复制。");
    } catch {
      setStatus(`复制失败，可以手动复制：${url}`);
    }
  }

  function loadSavedPreview(id: string) {
    startTransition(async () => {
      try {
        setStatus("正在载入保存的路线卡...");
        const payload = await readJson<{ routeCard: RouteCardData }>(await fetch(`/api/route-cards/${id}`));
        setRouteCard(payload.routeCard);
        setPlanningTrace(normalizePlanningTrace(payload.routeCard.planningTrace));
        setCity(payload.routeCard.city);
        setStartDate(payload.routeCard.startDate);
        setEndDate(payload.routeCard.endDate || payload.routeCard.startDate);
        setStatus("已载入保存的路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  function deleteSaved(id: string) {
    startTransition(async () => {
      try {
        setStatus("正在删除路线卡...");
        const response = await fetch(`/api/route-cards/${id}`, { method: "DELETE" });
        if (!response.ok) {
          throw new Error("删除失败，请稍后再试。");
        }
        if (routeCard?.id === id) setRouteCard(null);
        await loadSaved();
        setStatus("已删除路线卡。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });
  }

  return (
    <div className="app-grid">
      <section className="planner-panel trip-creation-panel" aria-label="创建真实行程">
        <div className="creation-hero">
          <p className="eyebrow">AI 旅行规划</p>
          <h1>一句话开始规划</h1>
          <p className="hero-copy">选城市和日期，点几枚偏好，再用一句自然语言补充这趟旅行。结果、保存和调整都放在右侧工作台。</p>
          <div className="trust-strip" aria-label="规划可信来源">
            <span>高德真实地点</span>
            <span>AI 路线编排</span>
            <span>Exa 公开证据</span>
            <span>异常时本地兜底</span>
          </div>
        </div>

        <div className="create-mode-tabs" aria-label="创建方式">
          <button
            aria-pressed={activeCreateMode === "new"}
            className={activeCreateMode === "new" ? "active" : ""}
            onClick={() => setActiveCreateMode("new")}
            type="button"
          >
            创建新计划
          </button>
          <button
            aria-pressed={activeCreateMode === "import"}
            className={activeCreateMode === "import" ? "active" : ""}
            onClick={() => setActiveCreateMode("import")}
            type="button"
          >
            智能导入地点/行程
          </button>
          <button aria-label="采集识别即将支持" disabled title="采集识别即将支持" type="button">
            采集识别
          </button>
        </div>

        <div className="form-grid">
          <label>
            城市
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              {cityOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            出发日期
            <input value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" />
          </label>
          <label>
            结束日期
            <input value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" />
          </label>
        </div>
        <p className="form-hint">
          系统会根据日期范围自动计算行程天数；当前先支持 {tripDates ? `${tripDates.durationDays} 天` : "1-2 天"} 行程。
        </p>

        <div className="preference-chip-panel">
          <div>
            <p className="section-kicker">Planning Chips</p>
            <h3>点几枚旅行偏好</h3>
            <p>芯片会参与需求理解和真实地点检索，方便快速表达这趟旅行的风格。</p>
          </div>
          <div className="preference-chip-grid">
            {preferenceOptions.map((preference) => (
              <button
                aria-pressed={tripPreferences.includes(preference)}
                className={tripPreferences.includes(preference) ? "preference-chip active" : "preference-chip"}
                key={preference}
                onClick={() => togglePreference(preference)}
                type="button"
              >
                {preference}
              </button>
            ))}
          </div>
        </div>

        <section className="natural-language-panel" aria-labelledby="natural-language-title">
          <div>
            <p className="section-kicker">Natural Brief</p>
            <h3 id="natural-language-title">补充偏好</h3>
            <p>把“不想太累、想拍照、带朋友、想吃本地小吃”这类自然话写在这里就好。</p>
          </div>
          <label>
            一句话描述
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </section>

        {activeCreateMode === "import" ? (
          <section className="import-workbench" aria-labelledby="import-workbench-title">
            <div>
              <p className="section-kicker">Smart Import</p>
              <h3 id="import-workbench-title">智能导入内容</h3>
              <p>粘贴后先识别，确认草稿没问题再应用到规划表单。</p>
            </div>
            <label>
              导入文本
              <textarea
                placeholder="粘贴朋友发来的地点清单、旧行程、攻略摘录或备忘录。"
                value={importedText}
                onChange={(event) => setImportedText(event.target.value)}
              />
            </label>
            <div className="import-actions">
              <button onClick={parseImportedText} type="button">
                识别导入内容
              </button>
              <button onClick={applyImportDraft} type="button">
                应用到规划表单
              </button>
            </div>
            <div className="import-draft-panel" aria-label="导入识别草稿">
              <div className="import-draft-heading">
                <div>
                  <span>导入识别草稿</span>
                  <strong>{importDraft?.rawText ? "已生成可编辑草稿" : "等待粘贴内容"}</strong>
                </div>
                <em className="import-confidence">{Math.round((importDraft?.confidence || 0) * 100)}%</em>
              </div>
              <div className="import-draft-grid">
                <div>
                  <span>识别地点</span>
                  <div className="import-chip-row">
                    {importDraft?.placeNames.length ? (
                      importDraft.placeNames.map((place) => (
                        <em className="import-chip" key={place}>
                          {place}
                        </em>
                      ))
                    ) : (
                      <p>暂无地点，粘贴后先识别。</p>
                    )}
                  </div>
                </div>
                <div>
                  <span>识别约束</span>
                  <p>{importDraft?.avoidText || "暂无避开要求，仍可手动补充。"}</p>
                </div>
                <div>
                  <span>偏好线索</span>
                  <div className="import-chip-row">
                    {importDraft?.preferenceHints.length ? (
                      importDraft.preferenceHints.map((preference) => (
                        <em className="import-chip import-chip--soft" key={preference}>
                          {preference}
                        </em>
                      ))
                    ) : (
                      <p>暂无偏好芯片。</p>
                    )}
                  </div>
                </div>
                <div>
                  <span>解析备注</span>
                  <ul>
                    {(importDraft?.parseNotes || []).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="planning-constraints-panel advanced-fields-panel" aria-labelledby="planning-constraints-title">
          <div>
            <p className="section-kicker">Planning Details</p>
            <h3 id="planning-constraints-title">可选：补充真实约束</h3>
            <p className="constraint-copy">不用填满，写几个关键点就能让路线更像真实计划。</p>
          </div>
          <div className="constraint-grid">
            <label>
              预算范围
              <select value={budgetRange} onChange={(event) => setBudgetRange(event.target.value as BudgetRange)}>
                {budgetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              同行人
              <select value={companion} onChange={(event) => setCompanion(event.target.value as CompanionType)}>
                {companionOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              交通偏好
              <select
                value={transportPreference}
                onChange={(event) => setTransportPreference(event.target.value as TransportPreference)}
              >
                {transportOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              起点区域
              <input
                placeholder="例如：杭州东站 / 酒店附近"
                value={startPoint}
                onChange={(event) => setStartPoint(event.target.value)}
              />
            </label>
            <label>
              结束区域
              <input
                placeholder="例如：西湖边 / 火车站"
                value={endPoint}
                onChange={(event) => setEndPoint(event.target.value)}
              />
            </label>
            <label className="constraint-wide">
              必去地点
              <textarea
                placeholder="例如：西湖、法喜寺、朋友推荐的咖啡店"
                value={mustVisitText}
                onChange={(event) => setMustVisitText(event.target.value)}
              />
            </label>
            <label className="constraint-wide">
              想避开/不想去
              <textarea
                placeholder="例如：不要太赶、少排队、不想去寺庙、尽量室内"
                value={avoidText}
                onChange={(event) => setAvoidText(event.target.value)}
              />
            </label>
          </div>
        </section>

        <div className="action-row create-action-row">
          <button className="primary" disabled={isPending} onClick={generate} type="button">
            {isPending ? "规划中..." : "生成真实行程"}
          </button>
        </div>
        <p className="status">{status}</p>
        <div className="planning-progress-stream" aria-label="规划进度流">
          <div className="progress-stream-heading">
            <div>
              <p className="section-kicker">Progress Ledger</p>
              <h3>规划进度流</h3>
            </div>
            <div className="progress-legend" aria-label="进度状态图例">
              <span>等待开始</span>
              <span>进行中</span>
              <span>已完成</span>
              <span>需确认</span>
            </div>
          </div>
          <ol>
            {asyncPlanningPreflightStages.map((event, index) => {
              const stageState = isPending || planningStageError ? planningStageState(index) : "queued";
              return (
                <li className={`progress-stage progress-stage--${stageState}`} key={event.id}>
                  <div className="progress-stage-copy">
                    <span>{event.label}</span>
                    <small>{event.detail}</small>
                  </div>
                  <em>{planningStageStatusLabel(stageState)}</em>
                </li>
              );
            })}
            {displayedPlanningTrace().map((event) => {
              const stageState = event.status;
              return (
                <li className={`progress-stage progress-stage--${stageState}`} key={event.nodeId}>
                  <div className="progress-stage-copy">
                    <span>{event.label}</span>
                    {event.detail ? <small>{event.detail}</small> : null}
                  </div>
                  <em>{planningStageStatusLabel(stageState)}</em>
                </li>
              );
            })}
          </ol>
          <p>这些是诚实的规划阶段提示；不展示未接入来源，也不冒充小红书官方搜索。如果生成失败，保留输入后直接重试。</p>
        </div>
      </section>

      <section className="preview-panel">
        {routeCard ? (
          <>
            <div className="result-workspace-heading">
              <p className="section-kicker">Current Trip Workspace</p>
              <h2>地图 + 每日行程</h2>
              <p>当前旅行工作台会把真实地图点位、每日行程卡、来源证据和风险提醒放在同一个可调整视图里。</p>
            </div>
            <RouteCard
              routeCard={routeCard}
              onStopAction={handleStopAction}
              onRevalidateOrder={handleRevalidateOrder}
              actionsDisabled={isPending}
            />
            <div className="result-actions">
              <button className="primary" disabled={isPending} onClick={save} type="button">
                保存当前行程
              </button>
              <button onClick={generate} type="button" disabled={isPending}>
                再规划一版
              </button>
              <a href={sharePathFor(routeCard)} target="_blank" rel="noreferrer">
                打开分享页
              </a>
              <button onClick={() => void copyShareLink(routeCard)} type="button">
                复制分享链接
              </button>
            </div>
            <div className="revision-panel">
              <div>
                <p className="section-kicker">Route Workbench</p>
                <h3>调整路线</h3>
                <p>生成后不用重填需求，可以继续要求它少走路、加饭点、改室内或压缩行程。</p>
              </div>
              <div className="revision-quick-actions">
                {revisionQuickActions.map((action) => (
                  <button key={action} onClick={() => applyRevisionQuickAction(action)} type="button">
                    {action}
                  </button>
                ))}
              </div>
              <label>
                调整要求
                <textarea
                  placeholder="例如：少走路一点，中午加一个本地吃饭点，下午尽量室内"
                  value={revisionNote}
                  onChange={(event) => setRevisionNote(event.target.value)}
                />
              </label>
              <button className="revision-submit" disabled={isPending} onClick={reviseRoute} type="button">
                重新调整路线
              </button>
              {routeCard.revisionSummary ? <p className="revision-summary">{routeCard.revisionSummary}</p> : null}
            </div>
            <div className="share-switch" aria-label="分享包装">
              <p>分享包装</p>
              <small>分享是附属能力，先把路线规划到能出发。</small>
              <button className={shareMode === "poster" ? "active" : ""} onClick={() => setShareMode("poster")} type="button">
                海报包装
              </button>
              <button className={shareMode === "story" ? "active" : ""} onClick={() => setShareMode("story")} type="button">
                故事包装
              </button>
            </div>
            {shareMode === "poster" ? <PosterShareCard routeCard={routeCard} /> : <StoryShareCard routeCard={routeCard} />}
          </>
        ) : (
            <div className="empty-preview">
              <p className="section-kicker">Result Preview</p>
              <h2>你的行程结果会出现在这里</h2>
              <p>地图 + 每日行程会在这里展开；生成前先保持清爽，不提前展示无效的保存和调整动作。</p>
            <div className="empty-preview-grid">
              <span>真实地图路线</span>
              <span>DAY 行程卡</span>
              <span>来源证据</span>
              <span>风险与行前检查</span>
              </div>
              <p>生成后会出现完整旅行工作台；当前旅行工作台支持点选地图点位、拖拽调整当天顺序、继续让 AI 少走路或加吃饭点。</p>
              <small>右侧只负责结果预览和已保存行程，左侧只负责创建。</small>
            </div>
        )}
        <div className="saved-list workspace-sidebar">
          <p className="section-kicker">My Trips</p>
          <h3>我的行程库</h3>
          <p className="saved-list-copy">保存后会在这里形成可再次打开的旅行计划。</p>
          {saved.length ? (
            saved.map((item) => (
              <div className="saved-item" key={item.id}>
                <strong>{item.title}</strong>
                <span>
                  {item.city} · {item.themeLabel} · {Math.round(item.confidence * 100)}%
                </span>
                <div className="saved-actions">
                  <button onClick={() => loadSavedPreview(item.id)} type="button" disabled={isPending}>
                    预览
                  </button>
                  <a href={item.sharePath} target="_blank" rel="noreferrer">
                    打开 / 分享
                  </a>
                  <button onClick={() => deleteSaved(item.id)} type="button" disabled={isPending}>
                    删除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p>还没有保存的路线卡。</p>
          )}
        </div>
      </section>
    </div>
  );
}
