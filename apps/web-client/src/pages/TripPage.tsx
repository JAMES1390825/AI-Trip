import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  cityLabel,
  collectMapPoints,
  getConfig,
  getProfile,
  getCurrentItinerary,
  getPlanDiff,
  getPlanExecution,
  getPreTripTasks,
  getSelectedPlanId,
  itineraryDateLabel,
  itineraryTitle,
  listPlanVersions,
  listSavedPlans,
  loadSavedPlan,
  normalizeDate,
  padHour,
  parseError,
  replanPlan,
  replacePlanExecution,
  replacePreTripTasks,
  revertPlan,
  saveCurrentItinerary,
  savePlan,
  setSelectedPlanId,
  toast,
  trackEvent,
} from "../../assets/js/core";

const REPLAN_OPTIONS = [
  { id: "save_money", label: "更省预算" },
  { id: "upgrade", label: "提升体验" },
  { id: "more_food", label: "多一点美食" },
  { id: "swap_spot", label: "替换一个景点" },
  { id: "change_date", label: "改出发日期" },
];

const DAY_LINE_COLORS = ["#2f6bd9", "#ff7d4d", "#2ab6a5", "#ff4e7a", "#0ea5a1", "#6366f1"];
const HOUR_OPTIONS = Array.from({ length: 25 }, (_, hour) => hour);
const DEFAULT_REMINDER_OFFSET_HOURS = [168, 72, 24];
const ALLOWED_REMINDER_OFFSET_HOURS = [24, 48, 72, 168];
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeReminderOffsetHours(values: any) {
  const list = Array.isArray(values) ? values : [];
  const normalized = list
    .map((item) => Number(item))
    .filter((item, index, arr) => Number.isInteger(item) && ALLOWED_REMINDER_OFFSET_HOURS.includes(item) && arr.indexOf(item) === index)
    .sort((a, b) => b - a);
  return normalized.length ? normalized : [...DEFAULT_REMINDER_OFFSET_HOURS];
}

function normalizeTaskReminder(task: any, profile: any) {
  const reminder = typeof task?.reminder === "object" && task?.reminder ? task.reminder : {};
  const enabled = reminder?.enabled == null ? Boolean(profile?.reminderEnabled ?? true) : Boolean(reminder.enabled);
  const offsetHours = normalizeReminderOffsetHours(reminder?.offset_hours ?? profile?.reminderOffsetHours);
  return {
    enabled,
    offset_hours: offsetHours,
  };
}

function normalizeTaskItem(task: any, profile: any) {
  return {
    ...task,
    id: String(task?.id || "").trim(),
    category: String(task?.category || "general").trim() || "general",
    title: String(task?.title || "").trim(),
    due_at: String(task?.due_at || "").trim(),
    status: String(task?.status || "todo").trim().toLowerCase() || "todo",
    reminder: normalizeTaskReminder(task, profile),
  };
}

function isPendingTaskStatus(status: any) {
  const normalized = String(status || "todo").trim().toLowerCase();
  return normalized !== "done" && normalized !== "skipped";
}

function resolveTaskDueAtMs(task: any, itinerary: any) {
  const dueAt = String(task?.due_at || "").trim();
  if (dueAt) {
    const parsed = Date.parse(dueAt);
    if (Number.isFinite(parsed)) return parsed;
  }

  const fallbackStart = normalizeDate(itinerary?.start_date || itinerary?.request_snapshot?.start_date || "");
  if (!fallbackStart) return NaN;
  const fallback = Date.parse(`${fallbackStart}T09:00:00`);
  return Number.isFinite(fallback) ? fallback : NaN;
}

function formatTaskDueLabel(task: any, itinerary: any) {
  const dueAt = String(task?.due_at || "").trim();
  if (dueAt) {
    return dueAt.replace("T", " ").slice(0, 16);
  }
  const fallbackStart = normalizeDate(itinerary?.start_date || itinerary?.request_snapshot?.start_date || "");
  if (!fallbackStart) return "";
  return `${fallbackStart} 09:00`;
}


let amapScriptPromise: Promise<any> | null = null;

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDateKey(baseDate: string, offsetDays: number) {
  const base = new Date(`${baseDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + offsetDays);
  return localDateKey(base);
}

function resolveDayDateKey(day: any, dayIdx: number, fallbackStartDate: string) {
  const normalizedDayDate = normalizeDate(day?.date || "");
  if (normalizedDayDate) return normalizedDayDate;
  if (!fallbackStartDate) return "";
  const dayIndex = Number(day?.day_index ?? dayIdx);
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return "";
  return shiftDateKey(fallbackStartDate, dayIndex);
}

function normalizeExecutionStatus(status: any): "pending" | "done" | "skipped" {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "done" || normalized === "skipped") return normalized;
  return "pending";
}

function buildFallbackBlockId(dayIndex: number, block: any, blockIdx: number) {
  const startHour = Number(block?.start_hour);
  const endHour = Number(block?.end_hour);
  if (Number.isFinite(startHour) && Number.isFinite(endHour)) {
    return `d${dayIndex + 1}-${padHour(startHour)}-${padHour(endHour)}-${String(blockIdx + 1).padStart(2, "0")}`;
  }
  return `d${dayIndex + 1}-b${String(blockIdx + 1).padStart(2, "0")}`;
}

function resolveExecutionBlockId(dayIndex: number, block: any, blockIdx: number) {
  const blockId = String(block?.block_id || "").trim();
  if (blockId) return blockId;
  return buildFallbackBlockId(dayIndex, block, blockIdx);
}

function executionStateKey(dayIndex: number, blockId: string) {
  return `${dayIndex}::${String(blockId || "").trim()}`;
}

function blockExecutionMeta(day: any, dayIdx: number, block: any, blockIdx: number) {
  const dayIndex = Number(day?.day_index ?? dayIdx);
  const blockId = resolveExecutionBlockId(dayIndex, block, blockIdx);
  return {
    dayIndex,
    blockId,
    stateKey: executionStateKey(dayIndex, blockId),
  };
}

function executionStateMapFromBlocks(blocks: any[]) {
  const next: Record<string, "pending" | "done" | "skipped"> = {};
  if (!Array.isArray(blocks)) return next;
  blocks.forEach((item: any) => {
    const dayIndex = Number(item?.day_index);
    const blockId = String(item?.block_id || "").trim();
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || !blockId) return;
    next[executionStateKey(dayIndex, blockId)] = normalizeExecutionStatus(item?.status);
  });
  return next;
}

function normalizeRiskAction(action: any) {
  if (!action) {
    return { type: "noop", label: "暂不处理", payload: {} as Record<string, any> };
  }
  if (typeof action === "string") {
    const legacy = String(action).trim().toLowerCase();
    if (legacy === "replan_window") {
      return { type: "replan_window", label: "替换该时段", payload: {} as Record<string, any> };
    }
    if (legacy === "regenerate_or_replan") {
      return { type: "noop", label: "稍后重排", payload: {} as Record<string, any> };
    }
    if (legacy === "unlock_or_change_window") {
      return { type: "replan_window", label: "调整冲突时段", payload: {} as Record<string, any> };
    }
    return { type: "noop", label: "暂不处理", payload: {} as Record<string, any> };
  }

  const type = String(action?.type || "noop").trim().toLowerCase();
  const payload = typeof action?.payload === "object" && action?.payload ? action.payload : {};
  const defaultLabel =
    type === "replan_window"
      ? "替换该时段"
      : type === "add_pretrip_task"
        ? "加入出发清单"
        : type === "open_external_link"
          ? "查看建议"
          : "暂不处理";
  return {
    type,
    label: String(action?.label || defaultLabel),
    payload,
  };
}

function markerHtml(label: string, active: boolean) {
  const bg = active ? "#ff4e7a" : "#2f6bd9";
  const shadow = active ? "0 0 0 3px rgba(255, 78, 122, 0.22)" : "0 2px 6px rgba(23, 56, 99, 0.28)";
  return `<div style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${bg};color:#fff;font-size:12px;font-weight:700;box-shadow:${shadow};">${label}</div>`;
}

async function loadAmapSdk(key: string) {
  const win = window as any;
  if (win.AMap) {
    return win.AMap;
  }

  if (!key) {
    throw new Error("请先在设置页填写高德地图授权码。`设置 -> 地图展示授权码`。");
  }

  if (!amapScriptPromise) {
    amapScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-amap-sdk='true']") as HTMLScriptElement | null;
      if (existing) {
        // Previous load may have failed and left a stale script tag; remove it to allow retry.
        if (!(window as any).AMap && existing.dataset.loaded === "true") {
          existing.remove();
        } else {
          existing.addEventListener(
            "load",
            () => {
              existing.dataset.loaded = "true";
              const amap = (window as any).AMap;
              if (amap) {
                resolve(amap);
                return;
              }
              amapScriptPromise = null;
              reject(new Error("高德地图初始化失败，请检查授权码和域名白名单。"));
            },
            { once: true },
          );
          existing.addEventListener(
            "error",
            () => {
              amapScriptPromise = null;
              reject(new Error("高德地图脚本加载失败。"));
            },
            { once: true },
          );
          return;
        }
      }

      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.dataset.amapSdk = "true";
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.Scale,AMap.ToolBar`;
      script.onload = () => {
        script.dataset.loaded = "true";
        const amap = (window as any).AMap;
        if (amap) {
          resolve(amap);
          return;
        }
        amapScriptPromise = null;
        script.remove();
        reject(new Error("高德地图初始化失败，请检查授权码和域名白名单。"));
      };
      script.onerror = () => {
        amapScriptPromise = null;
        script.remove();
        reject(new Error("高德地图脚本加载失败。"));
      };
      document.head.appendChild(script);
    });
  }

  return amapScriptPromise;
}

export default function TripPage() {
  const [params] = useSearchParams();
  const [itinerary, setItinerary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activePlanId, setActivePlanId] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [revertingVersion, setRevertingVersion] = useState<number | null>(null);
  const [intent, setIntent] = useState("save_money");
  const [dayIndex, setDayIndex] = useState("");
  const [windowDayIndex, setWindowDayIndex] = useState("");
  const [windowStartHour, setWindowStartHour] = useState("9");
  const [windowEndHour, setWindowEndHour] = useState("18");
  const [keepLockedForWindow, setKeepLockedForWindow] = useState(true);
  const [extra, setExtra] = useState("");
  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapError, setMapError] = useState("");
  const [mapDayFilter, setMapDayFilter] = useState("");
  const [mapRenderMode, setMapRenderMode] = useState<"map" | "timeline">("map");
  const [mapReloadToken, setMapReloadToken] = useState(0);
  const [viewMode, setViewMode] = useState<"all" | "today">("all");
  const [activeBlockKey, setActiveBlockKey] = useState("");
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksSaving, setTasksSaving] = useState(false);
  const [preTripTasks, setPreTripTasks] = useState<any[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffResult, setDiffResult] = useState<any>(null);
  const [diffFromVersion, setDiffFromVersion] = useState("");
  const [diffToVersion, setDiffToVersion] = useState("");
  const [diffDayFilter, setDiffDayFilter] = useState("");
  const [executionByBlock, setExecutionByBlock] = useState<Record<string, "pending" | "done" | "skipped">>({});
  const [executionDate, setExecutionDate] = useState("");
  const [executionSyncing, setExecutionSyncing] = useState(false);
  const [executionSavingKey, setExecutionSavingKey] = useState("");
  const [riskActionLoadingKey, setRiskActionLoadingKey] = useState("");
  const [taskFilterMode, setTaskFilterMode] = useState<"all" | "due_soon_unfinished">("all");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return "unsupported";
    }
    return Notification.permission;
  });

  const reminderProfile = useMemo(() => getProfile(), []);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapMarkersRef = useRef<Map<string, { marker: any; sequence: string }>>(new Map());
  const mapPolylinesRef = useRef<any[]>([]);
  const mapDiagSeenSignatureRef = useRef("");
  const executionScopeRef = useRef("");
  const riskDiagSeenSignatureRef = useRef("");
  const preTripTaskPanelRef = useRef<HTMLDivElement | null>(null);
  const reminderShownSignatureRef = useRef("");
  const reminderScheduledSignatureRef = useRef("");
  const notifiedTaskSetRef = useRef<Set<string>>(new Set());

  const amapKey = String(getConfig().amapJsKey || "").trim();

  function clearMapOverlays() {
    const map = mapInstanceRef.current;
    if (!map) return;

    mapMarkersRef.current.forEach((entry) => {
      map.remove(entry.marker);
    });
    mapMarkersRef.current.clear();

    mapPolylinesRef.current.forEach((polyline) => {
      map.remove(polyline);
    });
    mapPolylinesRef.current = [];
  }

  function focusBlockOnMap(blockKey: string) {
    setActiveBlockKey(blockKey);
    const target = mapMarkersRef.current.get(blockKey);
    const map = mapInstanceRef.current;
    if (!target || !map) return;

    const pos = target.marker.getPosition?.();
    if (pos) {
      map.setCenter(pos);
      const zoom = Number(map.getZoom?.() || 11);
      if (zoom < 13) {
        map.setZoom(13);
      }
    }
  }

  function retryMapLoad() {
    setMapRenderMode("map");
    setMapReloadToken((prev) => prev + 1);
  }

  function switchTimelineOnlyMode() {
    setMapRenderMode("timeline");
    setMapStatus("idle");
    setMapError("");
  }

  function trackMapDiagnosticAction(action: string, code: string) {
    void trackEvent("map_diagnostic_action_clicked", {
      action,
      code: String(code || ""),
      map_status: mapStatus,
      render_mode: mapRenderMode,
    });
  }

  function runMapDiagnosticAction(action: string, code: string) {
    trackMapDiagnosticAction(action, code);
    if (action === "retry" || action === "restore_map") {
      retryMapLoad();
      return;
    }
    if (action === "timeline_only") {
      switchTimelineOnlyMode();
      return;
    }
    if (action === "clear_filter") {
      setMapDayFilter("");
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadDefaultItinerary() {
      try {
        const queryId = params.get("id");
        if (queryId) {
          const body = await loadSavedPlan(queryId);
          if (!mounted) return;
          setItinerary(body?.itinerary || null);
          setSelectedPlanId(queryId);
          setActivePlanId(queryId);
          saveCurrentItinerary(body?.itinerary || null);
          return;
        }

        const local = getCurrentItinerary();
        if (local) {
          if (!mounted) return;
          setItinerary(local);
          const selectedId = getSelectedPlanId();
          if (selectedId) {
            setActivePlanId(selectedId);
          }
          return;
        }

        const selectedId = getSelectedPlanId();
        if (selectedId) {
          const body = await loadSavedPlan(selectedId);
          if (!mounted) return;
          setItinerary(body?.itinerary || null);
          setActivePlanId(selectedId);
          saveCurrentItinerary(body?.itinerary || null);
          return;
        }

        const list = await listSavedPlans(1);
        if (Array.isArray(list) && list.length > 0 && list[0].id) {
          const firstId = list[0].id;
          const body = await loadSavedPlan(firstId);
          if (!mounted) return;
          setItinerary(body?.itinerary || null);
          setSelectedPlanId(firstId);
          setActivePlanId(firstId);
          saveCurrentItinerary(body?.itinerary || null);
        }
      } catch (error) {
        toast(parseError(error), "warn");
      }
    }

    void loadDefaultItinerary();
    return () => {
      mounted = false;
    };
  }, [params]);

  async function refreshVersions(planId = activePlanId) {
    if (!planId) {
      setVersions([]);
      return;
    }
    setVersionsLoading(true);
    try {
      const list = await listPlanVersions(planId, 20);
      setVersions(Array.isArray(list) ? list : []);
    } catch (error) {
      toast(parseError(error), "warn");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function refreshTasks(planId = activePlanId) {
    if (!planId) {
      setPreTripTasks([]);
      return;
    }
    setTasksLoading(true);
    try {
      const tasks = await getPreTripTasks(planId);
      const normalized = Array.isArray(tasks) ? tasks.map((task: any) => normalizeTaskItem(task, reminderProfile)) : [];
      setPreTripTasks(normalized);
    } catch (error) {
      toast(parseError(error), "warn");
    } finally {
      setTasksLoading(false);
    }
  }

  useEffect(() => {
    void refreshVersions(activePlanId);
    void refreshTasks(activePlanId);
    setDiffResult(null);
    setExecutionByBlock({});
    setExecutionDate("");
    setExecutionSavingKey("");
    setExecutionSyncing(false);
    executionScopeRef.current = "";
    setTaskFilterMode("all");
    reminderShownSignatureRef.current = "";
    reminderScheduledSignatureRef.current = "";
    notifiedTaskSetRef.current.clear();
    if (typeof Notification !== "undefined") {
      setNotificationPermission(Notification.permission);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlanId]);

  useEffect(() => {
    if (!versions.length) {
      setDiffFromVersion("");
      setDiffToVersion("");
      return;
    }

    const ordered = [...versions].sort((a: any, b: any) => Number(a.version || 0) - Number(b.version || 0));
    const latest = ordered[ordered.length - 1];
    const previous = ordered.length > 1 ? ordered[ordered.length - 2] : null;

    if (!diffToVersion) {
      setDiffToVersion(String(Number(latest?.version || 0)));
    }
    if (!diffFromVersion && previous) {
      setDiffFromVersion(String(Number(previous?.version || 0)));
    }
  }, [diffFromVersion, diffToVersion, versions]);

  const warnings = useMemo(() => {
    if (!itinerary) return [];
    const merged = [...(itinerary.warnings || []), ...(itinerary.weather_risks || [])]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return [...new Set(merged)];
  }, [itinerary]);

  const riskDiagnostics = useMemo(() => {
    if (!itinerary) return [];
    return Array.isArray(itinerary?.diagnostics) ? itinerary.diagnostics : [];
  }, [itinerary]);

  const changes = useMemo(() => {
    if (!itinerary) return [];
    return Array.isArray(itinerary.changes) ? itinerary.changes : [];
  }, [itinerary]);

  const conflicts = useMemo(() => {
    if (!itinerary) return [];
    return Array.isArray(itinerary.conflicts) ? itinerary.conflicts : [];
  }, [itinerary]);

  const itineraryDays = useMemo(() => {
    if (!itinerary) return [];
    return Array.isArray(itinerary.days) ? itinerary.days : [];
  }, [itinerary]);

  const mapPoints = useMemo(() => {
    if (!itinerary) return [];
    const days = itineraryDays;

    return collectMapPoints(itinerary)
      .map((point: any) => {
        const day = days.find((item: any, index: number) => Number(item.day_index ?? index) === Number(point.dayIndex));
        const blocks = Array.isArray(day?.blocks) ? day.blocks : [];
        const block = blocks[point.blockIndex] || {};
        const lat = Number(point.lat);
        const lon = Number(point.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        return {
          ...point,
          lat,
          lon,
          startHour: Number(block.start_hour ?? 0),
          endHour: Number(block.end_hour ?? 0),
          mapUrl: String(block.poi_map_url || ""),
          poi: block.poi || point.poi || "行程点位",
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.blockIndex - b.blockIndex;
      });
  }, [itinerary, itineraryDays]);

  const mapDayOptions = useMemo(() => {
    if (!itineraryDays.length) return [];
    return itineraryDays.map((day: any, idx: number) => {
      const dayValue = String(Number(day.day_index ?? idx));
      return {
        value: dayValue,
        label: `第 ${Number(day.day_index ?? idx) + 1} 天 · ${day.date || ""}`,
      };
    });
  }, [itineraryDays]);

  const todayMeta = useMemo(() => {
    const empty = {
      todayDateKey: "",
      todayDayValue: "",
      todayDayIndex: -1,
      currentBlockKey: "",
      currentBlockLabel: "",
      nextBlockKey: "",
      nextBlockLabel: "",
      minutesToNext: null as number | null,
    };
    if (!itineraryDays.length) return empty;

    const fallbackStartDate = normalizeDate(itinerary?.request_snapshot?.start_date || itinerary?.start_date || "");
    const todayKey = localDateKey(new Date());

    let matchedDay: any = null;
    let matchedDayIdx = -1;
    let matchedDayValue = "";
    for (let idx = 0; idx < itineraryDays.length; idx += 1) {
      const day = itineraryDays[idx] || {};
      const dayValue = String(Number(day.day_index ?? idx));
      const dayKey = resolveDayDateKey(day, idx, fallbackStartDate);
      if (dayKey && dayKey === todayKey) {
        matchedDay = day;
        matchedDayIdx = idx;
        matchedDayValue = dayValue;
        break;
      }
    }

    if (!matchedDay || matchedDayIdx < 0) return empty;

    const blocks = Array.isArray(matchedDay.blocks) ? matchedDay.blocks : [];
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let currentBlockKey = "";
    let currentBlockLabel = "";
    let nextBlockKey = "";
    let nextBlockLabel = "";
    let nextStartMinutes: number | null = null;

    blocks.forEach((block: any, blockIdx: number) => {
      const startHour = Number(block?.start_hour);
      const endHour = Number(block?.end_hour);
      if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return;

      const startMinutes = startHour * 60;
      const endMinutes = endHour * 60;
      const key = `${matchedDayValue}-${blockIdx}`;
      const label = String(block?.title || block?.poi || `第 ${blockIdx + 1} 个时段`);

      if (!currentBlockKey && nowMinutes >= startMinutes && nowMinutes < endMinutes) {
        currentBlockKey = key;
        currentBlockLabel = label;
        return;
      }

      if (startMinutes > nowMinutes && (nextStartMinutes === null || startMinutes < nextStartMinutes)) {
        nextStartMinutes = startMinutes;
        nextBlockKey = key;
        nextBlockLabel = label;
      }
    });

    const minutesToNext = nextStartMinutes === null ? null : Math.max(0, nextStartMinutes - nowMinutes);
    const todayDateKey = resolveDayDateKey(matchedDay, matchedDayIdx, fallbackStartDate);
    return {
      todayDateKey,
      todayDayValue: matchedDayValue,
      todayDayIndex: Number(matchedDayValue),
      currentBlockKey,
      currentBlockLabel,
      nextBlockKey,
      nextBlockLabel,
      minutesToNext,
    };
  }, [itinerary?.request_snapshot?.start_date, itinerary?.start_date, itineraryDays]);

  const timelineDays = useMemo(() => {
    if (viewMode !== "today") return itineraryDays;
    if (!todayMeta.todayDayValue) return [];
    const targetDay = Number(todayMeta.todayDayValue);
    return itineraryDays.filter((day: any, idx: number) => Number(day.day_index ?? idx) === targetDay);
  }, [itineraryDays, todayMeta.todayDayValue, viewMode]);

  const todayExecutionBlocks = useMemo(() => {
    if (viewMode !== "today" || !timelineDays.length) return [];
    const list: any[] = [];
    timelineDays.forEach((day: any, dayIdx: number) => {
      const dayIndex = Number(day?.day_index ?? dayIdx);
      (Array.isArray(day?.blocks) ? day.blocks : []).forEach((block: any, blockIdx: number) => {
        const meta = blockExecutionMeta(day, dayIdx, block, blockIdx);
        list.push({
          timelineKey: `${dayIndex}-${blockIdx}`,
          dayIndex: meta.dayIndex,
          blockId: meta.blockId,
          stateKey: meta.stateKey,
          blockIdx,
          startHour: Number(block?.start_hour ?? 0),
        });
      });
    });
    return list.sort((a: any, b: any) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      if (a.startHour !== b.startHour) return a.startHour - b.startHour;
      return a.blockIdx - b.blockIdx;
    });
  }, [timelineDays, viewMode]);

  const todayExecutionSummary = useMemo(() => {
    const summary = {
      total: todayExecutionBlocks.length,
      done: 0,
      skipped: 0,
      pending: 0,
    };
    todayExecutionBlocks.forEach((item: any) => {
      const status = normalizeExecutionStatus(executionByBlock[item.stateKey] || "pending");
      if (status === "done") {
        summary.done += 1;
        return;
      }
      if (status === "skipped") {
        summary.skipped += 1;
        return;
      }
      summary.pending += 1;
    });
    return summary;
  }, [executionByBlock, todayExecutionBlocks]);

  const diffItems = useMemo(() => {
    if (!Array.isArray(diffResult?.items)) return [];
    return diffResult.items;
  }, [diffResult]);

  const diffDayOptions = useMemo(() => {
    const daySet = new Set<number>();
    diffItems.forEach((item: any) => {
      const day = Number(item?.day_index);
      if (Number.isInteger(day) && day >= 0) {
        daySet.add(day);
      }
    });
    return Array.from(daySet)
      .sort((a, b) => a - b)
      .map((day) => ({ value: String(day), label: `第 ${day + 1} 天` }));
  }, [diffItems]);

  const filteredDiffItems = useMemo(() => {
    if (!diffDayFilter) return diffItems;
    const targetDay = Number(diffDayFilter);
    if (!Number.isInteger(targetDay)) return diffItems;
    return diffItems.filter((item: any) => Number(item?.day_index) === targetDay);
  }, [diffDayFilter, diffItems]);

  const taskCards = useMemo(() => {
    const nowMs = Date.now();
    return preTripTasks.map((rawTask: any) => {
      const task = normalizeTaskItem(rawTask, reminderProfile);
      const dueAtMs = resolveTaskDueAtMs(task, itinerary);
      const pending = isPendingTaskStatus(task.status);
      const dueSoon = pending && Number.isFinite(dueAtMs) && dueAtMs >= nowMs && dueAtMs - nowMs <= DUE_SOON_WINDOW_MS;
      return {
        ...task,
        dueAtMs,
        pending,
        dueSoon,
      };
    });
  }, [itinerary, preTripTasks, reminderProfile]);

  const dueSoonPendingTasks = useMemo(() => {
    if (!reminderProfile?.reminderEnabled) return [];
    return taskCards.filter((task: any) => task.dueSoon && task.reminder?.enabled);
  }, [taskCards, reminderProfile]);

  const visiblePreTripTasks = useMemo(() => {
    if (taskFilterMode !== "due_soon_unfinished") return taskCards;
    return taskCards.filter((task: any) => task.dueSoon);
  }, [taskCards, taskFilterMode]);

  const reminderUnsupported = notificationPermission === "unsupported";
  const reminderDenied = notificationPermission === "denied";

  useEffect(() => {
    if (!activePlanId) return;
    const schedulable = taskCards.filter((task: any) => task.pending && task.reminder?.enabled && Number.isFinite(task.dueAtMs));
    if (!schedulable.length) return;

    const signature = schedulable
      .map((task: any) => `${task.id}|${Math.round(task.dueAtMs)}|${(task.reminder?.offset_hours || []).join(",")}`)
      .join(";");
    if (!signature || signature === reminderScheduledSignatureRef.current) return;

    reminderScheduledSignatureRef.current = signature;
    void trackEvent("pretrip_reminder_scheduled", {
      plan_id: activePlanId,
      total: schedulable.length,
      offset_hours: normalizeReminderOffsetHours(reminderProfile?.reminderOffsetHours),
    });
  }, [activePlanId, reminderProfile, taskCards]);

  useEffect(() => {
    if (!activePlanId || !dueSoonPendingTasks.length) return;
    const signature = dueSoonPendingTasks.map((task: any) => String(task.id || "")).join("|");
    if (!signature || signature === reminderShownSignatureRef.current) return;

    reminderShownSignatureRef.current = signature;
    void trackEvent("pretrip_reminder_shown", {
      plan_id: activePlanId,
      total: dueSoonPendingTasks.length,
      channel: "in_app",
    });
  }, [activePlanId, dueSoonPendingTasks]);

  useEffect(() => {
    if (!activePlanId || notificationPermission !== "granted" || !dueSoonPendingTasks.length) return;
    if (typeof Notification === "undefined") return;

    dueSoonPendingTasks.forEach((task: any) => {
      const key = `${activePlanId}:${task.id}:${Math.round(Number(task.dueAtMs) || 0)}`;
      if (notifiedTaskSetRef.current.has(key)) return;

      try {
        const dueLabel = formatTaskDueLabel(task, itinerary);
        const title = String(task.title || "出发前任务");
        const notice = new Notification("出发前清单提醒", {
          body: dueLabel ? `${title}（最晚 ${dueLabel}）` : title,
          tag: `pretrip-${activePlanId}-${task.id}`,
        });
        notice.onclick = () => {
          window.focus();
          preTripTaskPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          void trackEvent("pretrip_reminder_clicked", {
            plan_id: activePlanId,
            task_id: String(task.id || ""),
            channel: "browser",
          });
        };

        notifiedTaskSetRef.current.add(key);
        void trackEvent("pretrip_reminder_shown", {
          plan_id: activePlanId,
          task_id: String(task.id || ""),
          channel: "browser",
        });
      } catch {
        // ignore browser notification errors and keep in-app banner as fallback
      }
    });
  }, [activePlanId, dueSoonPendingTasks, itinerary, notificationPermission]);
  const mapDiagnostics = useMemo(() => {
    const items: any[] = [];
    if (!itinerary) return items;

    const visibleMapPointCount = mapDayFilter
      ? mapPoints.filter((point: any) => Number(point.dayIndex) === Number(mapDayFilter)).length
      : mapPoints.length;

    if (mapRenderMode === "timeline") {
      items.push({
        code: "MAP_TIMELINE_ONLY",
        message: "你已切换到纯时间线模式，地图渲染已暂停。",
        actions: ["restore_map"],
      });
      return items;
    }

    if (!amapKey) {
      items.push({
        code: "MAP_KEY_MISSING",
        message: "尚未配置高德地图授权码。请前往偏好设置填写后重试。",
        actions: ["settings", "timeline_only"],
      });
      return items;
    }

    if (mapStatus === "error") {
      const lowerError = String(mapError || "").toLowerCase();
      let code = "MAP_RENDER_FAILED";
      if (lowerError.includes("白名单")) {
        code = "MAP_WHITELIST_MISMATCH";
      } else if (lowerError.includes("脚本") || lowerError.includes("sdk") || lowerError.includes("初始化")) {
        code = "MAP_SDK_LOAD_FAILED";
      }
      items.push({
        code,
        message: mapError || "地图加载失败，请检查配置后重试。",
        actions: ["retry", "settings", "timeline_only"],
      });
    }

    if (mapStatus === "ready" && visibleMapPointCount === 0) {
      items.push({
        code: "MAP_COORD_MISSING",
        message: mapDayFilter ? "当前筛选天数下缺少可用坐标点。" : "行程缺少可用坐标点，可先按时间线执行。",
        actions: mapDayFilter ? ["clear_filter", "timeline_only"] : ["timeline_only"],
      });
    }

    return items;
  }, [amapKey, itinerary, mapDayFilter, mapError, mapPoints, mapRenderMode, mapStatus]);

  useEffect(() => {
    if (diffDayFilter && !diffDayOptions.some((item: any) => item.value === diffDayFilter)) {
      setDiffDayFilter("");
    }
  }, [diffDayFilter, diffDayOptions]);

  useEffect(() => {
    const codes = mapDiagnostics
      .map((item: any) => String(item?.code || "").trim())
      .filter(Boolean)
      .sort();
    const signature = codes.join("|");
    if (!signature || mapDiagSeenSignatureRef.current === signature) {
      return;
    }
    mapDiagSeenSignatureRef.current = signature;
    codes.forEach((code) => {
      void trackEvent("map_diagnostic_seen", {
        code,
        map_status: mapStatus,
        render_mode: mapRenderMode,
      });
    });
  }, [mapDiagnostics, mapRenderMode, mapStatus]);

  useEffect(() => {
    const signatureBody = riskDiagnostics
      .map((item: any) => {
        const code = String(item?.code || "").trim();
        const targetDay = Number(item?.target?.day_index ?? -1);
        const blockId = String(item?.target?.block_id || "").trim();
        if (!code) return "";
        return `${code}|${targetDay}|${blockId}`;
      })
      .filter(Boolean)
      .sort()
      .join(";");
    const signature = `${activePlanId || "local"}|${signatureBody}`;
    if (!signatureBody || signature === riskDiagSeenSignatureRef.current) {
      return;
    }
    riskDiagSeenSignatureRef.current = signature;

    riskDiagnostics.forEach((item: any) => {
      const code = String(item?.code || "").trim();
      if (!code) return;
      const action = normalizeRiskAction(item?.action);
      void trackEvent("risk_diagnostic_seen", {
        code,
        level: String(item?.level || "").trim().toLowerCase(),
        action_type: action.type,
      });
    });
  }, [activePlanId, riskDiagnostics]);

  useEffect(() => {
    if (mapDayFilter && !mapDayOptions.some((item: any) => item.value === mapDayFilter)) {
      setMapDayFilter("");
    }
    if (dayIndex && !mapDayOptions.some((item: any) => item.value === dayIndex)) {
      setDayIndex("");
    }
    if (!windowDayIndex && mapDayOptions.length > 0) {
      setWindowDayIndex(mapDayOptions[0].value);
      return;
    }
    if (windowDayIndex && !mapDayOptions.some((item: any) => item.value === windowDayIndex)) {
      setWindowDayIndex(mapDayOptions[0]?.value || "");
    }
  }, [dayIndex, mapDayFilter, mapDayOptions, windowDayIndex]);

  useEffect(() => {
    if (viewMode !== "today") return;
    if (!todayMeta.todayDayValue) return;
    if (mapDayFilter !== todayMeta.todayDayValue) {
      setMapDayFilter(todayMeta.todayDayValue);
    }
    if (!dayIndex) {
      setDayIndex(todayMeta.todayDayValue);
    }
    if (windowDayIndex !== todayMeta.todayDayValue) {
      setWindowDayIndex(todayMeta.todayDayValue);
    }
  }, [dayIndex, mapDayFilter, todayMeta.todayDayValue, viewMode, windowDayIndex]);

  useEffect(() => {
    if (viewMode !== "today") return;
    const focusKey = todayMeta.currentBlockKey || todayMeta.nextBlockKey;
    if (!focusKey) return;
    setActiveBlockKey((prev) => prev || focusKey);
  }, [todayMeta.currentBlockKey, todayMeta.nextBlockKey, viewMode]);

  useEffect(() => {
    if (viewMode !== "today") return;
    if (!todayMeta.todayDateKey) return;

    if (!activePlanId) {
      setExecutionDate(todayMeta.todayDateKey);
      return;
    }

    const scopeKey = `${activePlanId}|${todayMeta.todayDateKey}`;
    if (executionScopeRef.current === scopeKey && executionDate === todayMeta.todayDateKey) {
      return;
    }

    executionScopeRef.current = scopeKey;
    let cancelled = false;
    setExecutionSyncing(true);

    async function loadTodayExecution() {
      try {
        const payload = await getPlanExecution(activePlanId, todayMeta.todayDateKey);
        if (cancelled) return;
        setExecutionByBlock(executionStateMapFromBlocks(payload?.blocks));
        setExecutionDate(String(payload?.date || todayMeta.todayDateKey));
        void trackEvent("trip_today_execution_loaded", {
          plan_id: activePlanId,
          date: String(payload?.date || todayMeta.todayDateKey),
          total: Number(payload?.summary?.total || 0),
          done: Number(payload?.summary?.done || 0),
          skipped: Number(payload?.summary?.skipped || 0),
          pending: Number(payload?.summary?.pending || 0),
        });
      } catch (error) {
        if (cancelled) return;
        const message = parseError(error);
        const lower = String(message || "").toLowerCase();
        if (lower.includes("execution state not found") || lower.includes("failed (404)")) {
          setExecutionByBlock({});
          setExecutionDate(todayMeta.todayDateKey);
          return;
        }
        toast(message, "warn");
      } finally {
        if (!cancelled) {
          setExecutionSyncing(false);
        }
      }
    }

    void loadTodayExecution();
    return () => {
      cancelled = true;
    };
  }, [activePlanId, executionDate, todayMeta.todayDateKey, viewMode]);

  const filteredMapPoints = useMemo(() => {
    if (!mapDayFilter) return mapPoints;
    const selectedDay = Number(mapDayFilter);
    return mapPoints.filter((point: any) => Number(point.dayIndex) === selectedDay);
  }, [mapDayFilter, mapPoints]);

  const activePoint = useMemo(() => {
    if (!activeBlockKey) return null;
    return mapPoints.find((point: any) => point.key === activeBlockKey) || null;
  }, [activeBlockKey, mapPoints]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!itinerary) return;
      if (mapRenderMode !== "map") {
        setMapStatus("idle");
        return;
      }
      if (!amapKey) {
        setMapStatus("idle");
        setMapError("请先在设置页配置高德地图授权码。路径：偏好设置 -> 地图展示授权码。");
        return;
      }
      if (!mapContainerRef.current) return;

      setMapStatus("loading");
      setMapError("");
      try {
        const AMap = await loadAmapSdk(amapKey);
        if (cancelled) return;

        if (!mapInstanceRef.current) {
          const map = new AMap.Map(mapContainerRef.current, {
            zoom: 11,
            resizeEnable: true,
            viewMode: "2D",
          });
          map.addControl(new AMap.Scale());
          map.addControl(new AMap.ToolBar({ position: { top: "12px", right: "12px" } }));
          mapInstanceRef.current = map;
        }

        setMapStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setMapStatus("error");
        setMapError(parseError(error));
      }
    }

    void initMap();
    return () => {
      cancelled = true;
    };
  }, [amapKey, itinerary, mapReloadToken, mapRenderMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const AMap = (window as any).AMap;
    if (!map || !AMap || mapStatus !== "ready") return;

    clearMapOverlays();
    if (!filteredMapPoints.length) return;

    const grouped = new Map<number, any[]>();
    for (const point of filteredMapPoints) {
      const dayKey = Number(point.dayIndex);
      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, []);
      }
      grouped.get(dayKey)?.push(point);
    }

    let seq = 1;
    const sortedDayKeys = Array.from(grouped.keys()).sort((a, b) => a - b);

    for (const dayKey of sortedDayKeys) {
      const points = grouped.get(dayKey) || [];
      points.sort((a: any, b: any) => {
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.blockIndex - b.blockIndex;
      });

      for (const point of points) {
        const sequence = String(seq++);
        const marker = new AMap.Marker({
          position: [point.lon, point.lat],
          offset: new AMap.Pixel(-12, -12),
          anchor: "center",
          title: point.poi,
          content: markerHtml(sequence, point.key === activeBlockKey),
        });

        marker.setMap(map);
        marker.on("click", () => {
          setActiveBlockKey(point.key);
          const targetNode = document.getElementById(`timeline-${point.key}`);
          targetNode?.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        mapMarkersRef.current.set(point.key, { marker, sequence });
      }

      if (points.length > 1) {
        const polyline = new AMap.Polyline({
          path: points.map((item: any) => [item.lon, item.lat]),
          strokeColor: DAY_LINE_COLORS[dayKey % DAY_LINE_COLORS.length],
          strokeWeight: 5,
          strokeOpacity: 0.85,
          lineJoin: "round",
          lineCap: "round",
          showDir: true,
        });
        polyline.setMap(map);
        mapPolylinesRef.current.push(polyline);
      }
    }

    const overlays = Array.from(mapMarkersRef.current.values()).map((item) => item.marker);
    if (activeBlockKey) {
      const active = mapMarkersRef.current.get(activeBlockKey);
      if (active) {
        active.marker.setContent(markerHtml(active.sequence, true));
        active.marker.setzIndex(999);
        const pos = active.marker.getPosition?.();
        if (pos) {
          map.setCenter(pos);
        }
      }
    } else if (overlays.length > 0) {
      map.setFitView(overlays, false, [70, 70, 70, 70]);
    }
  }, [activeBlockKey, filteredMapPoints, mapStatus]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    mapMarkersRef.current.forEach((entry, key) => {
      const isActive = key === activeBlockKey;
      entry.marker.setContent(markerHtml(entry.sequence, isActive));
      entry.marker.setzIndex(isActive ? 999 : 120);
    });

    if (activeBlockKey) {
      const active = mapMarkersRef.current.get(activeBlockKey);
      if (active) {
        const pos = active.marker.getPosition?.();
        if (pos) {
          map.setCenter(pos);
        }
      }
    }
  }, [activeBlockKey]);

  useEffect(() => {
    if (mapRenderMode !== "timeline") return;
    clearMapOverlays();
    if (mapInstanceRef.current?.destroy) {
      mapInstanceRef.current.destroy();
    }
    mapInstanceRef.current = null;
    setActiveBlockKey("");
  }, [mapRenderMode]);

  useEffect(() => {
    return () => {
      clearMapOverlays();
      if (mapInstanceRef.current?.destroy) {
        mapInstanceRef.current.destroy();
      }
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function formatVersionTime(value: any) {
    const date = new Date(value || "");
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(
      date.getHours(),
    ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function summarizeChange(change: any) {
    const type = String(change?.change_type || "").toLowerCase();
    switch (type) {
      case "replan_window":
        return `第 ${Number(change?.day_index || 0) + 1} 天 ${change?.start_hour ?? "-"}-${change?.end_hour ?? "-"} 点：${change?.old_poi || "-"} -> ${
          change?.new_poi || "-"
        }`;
      case "lock":
        return `已锁定时段 ${change?.start_hour ?? "-"}-${change?.end_hour ?? "-"} 点`;
      case "unlock":
        return `已解除锁定 ${change?.start_hour ?? "-"}-${change?.end_hour ?? "-"} 点`;
      case "budget":
        return `预算调整：${change?.old_value || "-"} -> ${change?.new_value || "-"}`;
      case "date":
        return `出发日期：${change?.old_value || "-"} -> ${change?.new_value || "-"}`;
      case "preferences":
        return "已根据新偏好调整候选活动";
      case "poi":
        return `${change?.old_poi || "-"} -> ${change?.new_poi || "-"}`;
      case "revert":
        return "版本回退已应用";
      default:
        return "行程已更新";
    }
  }

  function buildBlockTarget(day: any, dayIdx: number, block: any) {
    const target: any = {
      day_index: Number(day?.day_index ?? dayIdx),
    };
    const blockID = String(block?.block_id || "").trim();
    if (blockID) {
      target.block_id = blockID;
    }
    const startHour = Number(block?.start_hour);
    const endHour = Number(block?.end_hour);
    if (Number.isFinite(startHour) && Number.isFinite(endHour)) {
      target.start_hour = startHour;
      target.end_hour = endHour;
    }
    return target;
  }

  async function toggleBlockLock(day: any, dayIdx: number, block: any, lockValue: boolean) {
    if (!itinerary || loading) return;
    const target = buildBlockTarget(day, dayIdx, block);
    if (!target.block_id && !(Number.isInteger(target.start_hour) && Number.isInteger(target.end_hour))) {
      toast("当前时段缺少可定位信息，无法修改锁定状态。", "warn");
      return;
    }

    const patch: any = {
      change_type: lockValue ? "lock" : "unlock",
      targets: [target],
      keep_locked: true,
    };
    if (lockValue) {
      patch.lock_reason = "manual_lock_from_trip_page";
    }

    setLoading(true);
    try {
      const next = await replanPlan(itinerary, patch);
      setItinerary(next);
      saveCurrentItinerary(next);
      void trackEvent(lockValue ? "plan_block_locked" : "plan_block_unlocked", {
        day_index: target.day_index,
        block_id: target.block_id || "",
        start_hour: target.start_hour,
        end_hour: target.end_hour,
      });
      toast(lockValue ? "已锁定该时段，后续重排将自动保护。" : "已解除锁定，可参与后续重排。", "ok");
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setLoading(false);
    }
  }

  async function applyWindowReplan() {
    if (!itinerary || loading) return;
    const day = Number(windowDayIndex);
    const startHour = Number(windowStartHour);
    const endHour = Number(windowEndHour);

    if (!Number.isInteger(day)) {
      toast("请选择需要重排的天数。", "warn");
      return;
    }
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
      toast("请填写有效的时间窗口。", "warn");
      return;
    }
    if (startHour < 0 || endHour > 24 || startHour >= endHour) {
      toast("时间窗口需满足 0 <= start < end <= 24。", "warn");
      return;
    }

    const patch = {
      change_type: "replan_window",
      targets: [{ day_index: day, start_hour: startHour, end_hour: endHour }],
      affected_days: [day],
      keep_locked: keepLockedForWindow,
    };

    setLoading(true);
    try {
      void trackEvent("plan_replanned_window", {
        day_index: day,
        start_hour: startHour,
        end_hour: endHour,
        keep_locked: keepLockedForWindow,
      });
      const next = await replanPlan(itinerary, patch);
      setItinerary(next);
      saveCurrentItinerary(next);
      const conflictCount = Array.isArray(next?.conflicts) ? next.conflicts.length : 0;
      if (conflictCount > 0) {
        toast(`窗口重排完成，但有 ${conflictCount} 条冲突提醒。`, "warn");
      } else {
        toast("窗口重排完成，已更新目标时段。", "ok");
      }
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setLoading(false);
    }
  }

  function switchViewMode(nextMode: "all" | "today") {
    if (nextMode === viewMode) return;
    setViewMode(nextMode);
    void trackEvent("trip_mode_switched", { mode: nextMode });
    if (nextMode === "today" && todayMeta.todayDayValue) {
      setMapDayFilter(todayMeta.todayDayValue);
      setWindowDayIndex(todayMeta.todayDayValue);
      if (!dayIndex) {
        setDayIndex(todayMeta.todayDayValue);
      }
    }
  }

  function findNextPendingTimelineKey(
    currentTimelineKey: string,
    statusMap: Record<string, "pending" | "done" | "skipped"> = executionByBlock,
  ) {
    if (!todayExecutionBlocks.length) return "";
    const statusOf = (item: any) => normalizeExecutionStatus(statusMap[item.stateKey] || "pending");
    const startIndex = todayExecutionBlocks.findIndex((item: any) => item.timelineKey === currentTimelineKey);
    if (startIndex >= 0) {
      for (let i = startIndex + 1; i < todayExecutionBlocks.length; i += 1) {
        if (statusOf(todayExecutionBlocks[i]) === "pending") {
          return todayExecutionBlocks[i].timelineKey;
        }
      }
    }
    for (let i = 0; i < todayExecutionBlocks.length; i += 1) {
      if (statusOf(todayExecutionBlocks[i]) === "pending") {
        return todayExecutionBlocks[i].timelineKey;
      }
    }
    return "";
  }

  async function updateBlockExecutionStatus(
    day: any,
    dayIdx: number,
    block: any,
    blockIdx: number,
    nextStatus: "pending" | "done" | "skipped",
  ) {
    if (viewMode !== "today") return;
    const meta = blockExecutionMeta(day, dayIdx, block, blockIdx);
    const timelineKey = `${Number(day?.day_index ?? dayIdx)}-${blockIdx}`;
    const previousMap = { ...executionByBlock };
    const previousStatus = normalizeExecutionStatus(previousMap[meta.stateKey] || "pending");
    if (previousStatus === nextStatus) return;

    const optimisticMap = {
      ...previousMap,
      [meta.stateKey]: nextStatus,
    };
    setExecutionByBlock(optimisticMap);

    if (nextStatus !== "pending") {
      const nextFocus = findNextPendingTimelineKey(timelineKey, optimisticMap);
      if (nextFocus) {
        setActiveBlockKey(nextFocus);
      }
    }

    if (!activePlanId || !todayMeta.todayDateKey) {
      setExecutionDate(todayMeta.todayDateKey || executionDate);
      toast("当前尚未保存到行程库，已先记录本地执行状态。", "warn");
      return;
    }

    setExecutionSavingKey(meta.stateKey);
    try {
      const payload = await replacePlanExecution(activePlanId, todayMeta.todayDateKey, [
        {
          day_index: meta.dayIndex,
          block_id: meta.blockId,
          status: nextStatus,
        },
      ]);
      const nextMap = executionStateMapFromBlocks(payload?.blocks);
      setExecutionByBlock(nextMap);
      setExecutionDate(String(payload?.date || todayMeta.todayDateKey));

      const eventName =
        nextStatus === "done" ? "trip_today_block_done" : nextStatus === "skipped" ? "trip_today_block_skipped" : "trip_today_block_reset";
      void trackEvent(eventName, {
        plan_id: activePlanId,
        date: String(payload?.date || todayMeta.todayDateKey),
        day_index: meta.dayIndex,
        block_id: meta.blockId,
        status: nextStatus,
      });

      if (nextStatus !== "pending") {
        const nextFocus = findNextPendingTimelineKey(timelineKey, nextMap);
        if (nextFocus) {
          setActiveBlockKey(nextFocus);
        }
      }
    } catch (error) {
      setExecutionByBlock(previousMap);
      toast(`执行状态保存失败，已回退：${parseError(error)}`, "warn");
      void trackEvent("trip_today_execution_sync_failed", {
        plan_id: activePlanId,
        date: todayMeta.todayDateKey,
        day_index: meta.dayIndex,
        block_id: meta.blockId,
        to_status: nextStatus,
      });
    } finally {
      setExecutionSavingKey("");
    }
  }

  function resolveRiskReplanWindow(item: any) {
    const action = normalizeRiskAction(item?.action);
    const target = item?.target || {};
    const payload = action.payload || {};

    let dayIndex = Number(payload?.day_index ?? target?.day_index);
    let startHour = Number(payload?.start_hour);
    let endHour = Number(payload?.end_hour);
    let blockId = String(payload?.block_id || target?.block_id || "").trim();

    const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
    if (Number.isInteger(dayIndex) && dayIndex >= 0 && days.length) {
      const day = days.find((itemDay: any, idx: number) => Number(itemDay?.day_index ?? idx) === dayIndex);
      const blocks = Array.isArray(day?.blocks) ? day.blocks : [];
      const hit = blocks.find((block: any, idx: number) => {
        const candidate = resolveExecutionBlockId(dayIndex, block, idx);
        if (blockId) {
          return candidate === blockId;
        }
        return Number(block?.start_hour) === startHour && Number(block?.end_hour) === endHour;
      });
      if (hit) {
        blockId = String(hit?.block_id || blockId || "").trim();
        if (!Number.isInteger(startHour)) {
          startHour = Number(hit?.start_hour);
        }
        if (!Number.isInteger(endHour)) {
          endHour = Number(hit?.end_hour);
        }
      }
    }

    if (!Number.isInteger(dayIndex) || dayIndex < 0) {
      return null;
    }
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
      return null;
    }

    return {
      dayIndex,
      startHour,
      endHour,
      blockId,
    };
  }

  function buildTaskFromRiskDiagnostic(item: any) {
    const action = normalizeRiskAction(item?.action);
    const payload = action.payload || {};
    const now = Date.now();
    const fallbackId = `task-risk-${now}`;
    const title = String(payload?.title || item?.message || "处理风险提醒").trim();
    return {
      id: String(payload?.id || fallbackId),
      category: String(payload?.category || "risk").trim() || "risk",
      title: title || "处理风险提醒",
      due_at: String(payload?.due_at || "").trim(),
      status: String(payload?.status || "todo").trim().toLowerCase() || "todo",
      reminder: {
        enabled: Boolean(reminderProfile?.reminderEnabled ?? true),
        offset_hours: normalizeReminderOffsetHours(reminderProfile?.reminderOffsetHours),
      },
    };
  }

  async function runRiskDiagnosticAction(item: any, idx: number) {
    if (!itinerary) return;
    const code = String(item?.code || "UNKNOWN_RISK").trim();
    const action = normalizeRiskAction(item?.action);
    const targetDay = Number(item?.target?.day_index ?? -1);
    const targetBlock = String(item?.target?.block_id || "").trim();
    const actionKey = `${code}|${targetDay}|${targetBlock}|${idx}`;

    void trackEvent("risk_diagnostic_action_clicked", {
      code,
      action_type: action.type,
      day_index: targetDay,
      block_id: targetBlock,
    });

    setRiskActionLoadingKey(actionKey);
    try {
      if (action.type === "replan_window") {
        const windowInfo = resolveRiskReplanWindow(item);
        if (!windowInfo) {
          toast("该风险项缺少可重排的时间窗口。", "warn");
          return;
        }

        setLoading(true);
        try {
          const patch = {
            change_type: "replan_window",
            targets: [
              {
                day_index: windowInfo.dayIndex,
                start_hour: windowInfo.startHour,
                end_hour: windowInfo.endHour,
                ...(windowInfo.blockId ? { block_id: windowInfo.blockId } : {}),
              },
            ],
            affected_days: [windowInfo.dayIndex],
            keep_locked: true,
          };
          const next = await replanPlan(itinerary, patch);
          setItinerary(next);
          saveCurrentItinerary(next);
          toast("已按风险建议重排该时段。", "ok");
          void trackEvent("risk_diagnostic_resolved", {
            code,
            action_type: action.type,
            resolution: "replanned",
          });
        } finally {
          setLoading(false);
        }
        return;
      }

      if (action.type === "add_pretrip_task") {
        const nextTask = buildTaskFromRiskDiagnostic(item);
        const mergedTasks = [...preTripTasks.filter((task: any) => String(task?.id || "") !== nextTask.id), nextTask]
          .map((task: any) => normalizeTaskItem(task, reminderProfile));
        setPreTripTasks(mergedTasks);

        if (activePlanId) {
          setTasksSaving(true);
          try {
            const persisted = await replacePreTripTasks(activePlanId, mergedTasks);
            const normalizedPersisted = Array.isArray(persisted)
              ? persisted.map((task: any) => normalizeTaskItem(task, reminderProfile))
              : mergedTasks;
            setPreTripTasks(normalizedPersisted);
          } finally {
            setTasksSaving(false);
          }
          toast("已加入出发前清单。", "ok");
        } else {
          toast("已加入本地清单，请先保存行程后再同步到云端。", "warn");
        }

        void trackEvent("risk_diagnostic_resolved", {
          code,
          action_type: action.type,
          resolution: "task_added",
          persisted: Boolean(activePlanId),
        });
        return;
      }

      if (action.type === "open_external_link") {
        const url = String(action?.payload?.url || action?.payload?.href || "").trim();
        if (!/^https?:\/\//i.test(url)) {
          toast("外部链接无效，无法打开。", "warn");
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        toast("已打开外部链接。", "ok");
        void trackEvent("risk_diagnostic_resolved", {
          code,
          action_type: action.type,
          resolution: "external_link_opened",
        });
        return;
      }

      toast("该风险项当前无需操作。", "ok");
      void trackEvent("risk_diagnostic_resolved", {
        code,
        action_type: action.type,
        resolution: "noop",
      });
    } catch (error) {
      toast(parseError(error), "warn");
      void trackEvent("risk_diagnostic_action_failed", {
        code,
        action_type: action.type,
      });
    } finally {
      setRiskActionLoadingKey("");
    }
  }
  async function requestNotificationAccess() {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      toast("当前浏览器不支持桌面通知，已自动保留应用内提醒。", "warn");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === "granted") {
        toast("已开启浏览器提醒。", "ok");
      } else if (result === "denied") {
        toast("浏览器通知被拒绝，你仍会收到应用内提醒。", "warn");
      } else {
        toast("你暂未授权浏览器通知，可稍后再试。", "warn");
      }
    } catch {
      toast("浏览器通知授权失败，请稍后重试。", "warn");
    }
  }

  function jumpToPreTripTaskPanel() {
    preTripTaskPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTaskFilterMode("due_soon_unfinished");
    void trackEvent("pretrip_reminder_clicked", {
      plan_id: activePlanId,
      channel: "in_app",
      total: dueSoonPendingTasks.length,
    });
  }
  function buildReplanPatch() {
    const selectedDayValue = dayIndex || (viewMode === "today" ? todayMeta.todayDayValue : "");
    const selectedDay = Number(selectedDayValue);
    const affectedDays = Number.isInteger(selectedDay) ? [selectedDay] : [];

    switch (intent) {
      case "save_money":
        return { change_type: "budget", affected_days: affectedDays, new_budget_level: "low", preserve_locked: true };
      case "upgrade":
        return { change_type: "budget", affected_days: affectedDays, new_budget_level: "high", preserve_locked: true };
      case "more_food":
        return {
          change_type: "preferences",
          affected_days: affectedDays,
          new_travel_styles: ["food"],
          preserve_locked: true,
        };
      case "swap_spot":
        if (!extra.trim()) {
          throw new Error("请先填写要替换的景点名称。");
        }
        return { change_type: "poi", affected_days: affectedDays, remove_poi: extra.trim(), preserve_locked: true };
      case "change_date": {
        const date = normalizeDate(extra.trim());
        if (!date) {
          throw new Error("请填写新日期，例如 2026-05-02。");
        }
        return { change_type: "date", affected_days: affectedDays, new_start_date: date, preserve_locked: true };
      }
      default:
        throw new Error("暂不支持该优化方向。");
    }
  }

  async function applyReplan() {
    if (!itinerary || loading) return;

    let patch: any;
    try {
      patch = buildReplanPatch();
    } catch (error) {
      toast(parseError(error), "warn");
      return;
    }

    setLoading(true);
    try {
      void trackEvent("replan_triggered", { change_type: patch.change_type, affected_days: patch.affected_days || [] });
      const next = await replanPlan(itinerary, patch);
      setItinerary(next);
      saveCurrentItinerary(next);
      void trackEvent("replan_applied", { change_type: patch.change_type });
      const conflictCount = Array.isArray(next?.conflicts) ? next.conflicts.length : 0;
      if (conflictCount > 0) {
        toast(`优化完成，但有 ${conflictCount} 条冲突提醒。`, "warn");
      } else {
        toast("优化完成，已更新受影响时段。", "ok");
      }
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    if (!itinerary || loading) return;

    setLoading(true);
    try {
      const result = await savePlan(itinerary);
      if (result?.saved_plan_id) {
        setSelectedPlanId(result.saved_plan_id);
        setActivePlanId(result.saved_plan_id);
        void refreshVersions(result.saved_plan_id);
      }
      void trackEvent("plan_saved", { saved_plan_id: result?.saved_plan_id || "" });
      toast("已保存到“我的行程”。", "ok");
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setLoading(false);
    }
  }

  async function applyRevert(targetVersion: number) {
    if (!activePlanId || loading) return;

    const targetInfo = versions.find((item: any) => Number(item?.version || 0) === Number(targetVersion)) || null;
    const targetSummary = String(targetInfo?.summary || "行程更新");
    const targetTime = formatVersionTime(targetInfo?.created_at);
    const confirmed = window.confirm(
      `将回退到 v${targetVersion}\n摘要：${targetSummary}\n版本时间：${targetTime}\n\n系统会保留当前版本并新增一条回退版本，确认继续吗？`,
    );
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setRevertingVersion(targetVersion);
    try {
      const result = await revertPlan(activePlanId, targetVersion);
      const next = result?.itinerary || null;
      if (next) {
        setItinerary(next);
        saveCurrentItinerary(next);
      }
      await refreshVersions(activePlanId);
      void trackEvent("plan_reverted", {
        saved_plan_id: activePlanId,
        target_version: targetVersion,
        version: Number(result?.version || next?.version || 0),
      });
      toast(`已回退到 v${targetVersion}，并生成新版本。`, "ok");
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setRevertingVersion(null);
      setLoading(false);
    }
  }

  function updateTaskStatus(taskId: string, nextStatus: string) {
    setPreTripTasks((prev) =>
      prev.map((task) => {
        if (String(task?.id || "") !== String(taskId || "")) return task;
        return normalizeTaskItem(
          {
            ...task,
            status: nextStatus,
          },
          reminderProfile,
        );
      }),
    );
  }

  async function persistTasks() {
    if (!activePlanId || tasksSaving) return;
    setTasksSaving(true);
    try {
      const payload = preTripTasks.map((task: any) => normalizeTaskItem(task, reminderProfile));
      const next = await replacePreTripTasks(activePlanId, payload);
      const normalizedNext = Array.isArray(next) ? next.map((task: any) => normalizeTaskItem(task, reminderProfile)) : payload;
      setPreTripTasks(normalizedNext);
      void trackEvent("pretrip_task_updated", { plan_id: activePlanId, total: normalizedNext.length });
      toast("出发前清单已保存。", "ok");
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setTasksSaving(false);
    }
  }

  async function loadVersionDiff() {
    if (!activePlanId || diffLoading) return;
    const fromVersion = Number(diffFromVersion);
    const toVersion = Number(diffToVersion);
    if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion) || fromVersion < 1 || toVersion < 1) {
      toast("请先选择对比版本。", "warn");
      return;
    }
    if (fromVersion === toVersion) {
      toast("起始版本和目标版本不能相同。", "warn");
      return;
    }

    setDiffLoading(true);
    try {
      const diff = await getPlanDiff(activePlanId, fromVersion, toVersion);
      setDiffResult(diff || null);
      setDiffDayFilter("");
      void trackEvent("plan_diff_viewed", { plan_id: activePlanId, from_version: fromVersion, to_version: toVersion });
    } catch (error) {
      toast(parseError(error), "error");
    } finally {
      setDiffLoading(false);
    }
  }

  return (
    <>
      <section className="card trip-hero">
        <h1>{itinerary ? itineraryTitle(itinerary) : "暂无可展示的行程"}</h1>
        <p>{itinerary ? itineraryDateLabel(itinerary) : "请先在对话页生成，或从我的行程进入。"}</p>

        {itinerary && (
          <div className="pill-row">
            <span className="pill">共 {(itinerary.days || []).length || "-"} 天</span>
            <span className="pill">预计花费 ￥{Number(itinerary.estimated_cost || 0).toFixed(0)}</span>
            <span className="pill">出发地 {cityLabel(itinerary.request_snapshot?.origin_city || "")}</span>
            <span className="pill">版本 v{Number(itinerary.version || 1)}</span>
          </div>
        )}

        <div className="trip-actions">
          <button className="btn primary" type="button" onClick={() => void saveCurrent()} disabled={loading || !itinerary}>
            保存这版行程
          </button>
          <button className="btn secondary" type="button" onClick={() => toast("已刷新当前视图。", "ok")}>
            刷新行程内容
          </button>
          <Link className="btn secondary" to="/plan">
            回到对话继续修改
          </Link>
        </div>

        {itinerary && (
          <div className="mode-toggle">
            <button className={`mode-btn${viewMode === "all" ? " active" : ""}`} type="button" onClick={() => switchViewMode("all")}>
              全部行程
            </button>
            <button
              className={`mode-btn${viewMode === "today" ? " active" : ""}`}
              type="button"
              onClick={() => switchViewMode("today")}
              disabled={!todayMeta.todayDayValue}
              title={todayMeta.todayDayValue ? "" : "今天不在当前行程日期范围内"}
            >
              今天
            </button>
          </div>
        )}

        {itinerary && viewMode === "today" && (
          <>
            <div className={`status-banner ${todayMeta.todayDayValue ? "ok" : "warn"}`} style={{ marginTop: "10px" }}>
              {!todayMeta.todayDayValue && "今天不在本次行程日期范围内，可切换“全部行程”查看完整安排。"}
              {!!todayMeta.todayDayValue &&
                (todayMeta.currentBlockKey
                  ? `当前时段：${todayMeta.currentBlockLabel || "进行中"}`
                  : todayMeta.minutesToNext !== null
                    ? `距下一时段（${todayMeta.nextBlockLabel || "待执行项目"}）还有 ${todayMeta.minutesToNext} 分钟`
                    : "今天暂无后续时段，祝旅途愉快。")}
            </div>
            {!!todayMeta.todayDayValue && (
              <div className="execution-progress-row">
                <span className="execution-progress-chip">
                  今日进度 {todayExecutionSummary.done + todayExecutionSummary.skipped}/{todayExecutionSummary.total || 0}
                </span>
                <span className="execution-progress-meta">
                  完成 {todayExecutionSummary.done} · 跳过 {todayExecutionSummary.skipped} · 待执行 {todayExecutionSummary.pending}
                </span>
                {executionSyncing && <span className="execution-progress-sync">同步中...</span>}
              </div>
            )}
          </>
        )}
      </section>

      <main className="trip-layout">
        <section className="card map-card">
          {!itinerary && (
            <div className="map-empty">
              <div>
                <p>生成行程后即可展示地图。</p>
              </div>
            </div>
          )}

          {itinerary && mapRenderMode === "timeline" && (
            <div className="map-empty">
              <div>
                <p>当前已切换为纯时间线模式，地图渲染已暂停。</p>
                <div className="map-action-row" style={{ justifyContent: "center", marginTop: "10px" }}>
                  <button className="btn secondary" type="button" onClick={() => runMapDiagnosticAction("restore_map", "MAP_TIMELINE_ONLY")}>
                    恢复地图模式
                  </button>
                  <Link className="btn text" to="/settings" onClick={() => trackMapDiagnosticAction("settings", "MAP_TIMELINE_ONLY")}>
                    检查地图配置
                  </Link>
                </div>
              </div>
            </div>
          )}

          {itinerary && mapRenderMode === "map" && !amapKey && (
            <div className="map-empty">
              <div>
                <p>尚未配置高德地图授权码，暂时无法渲染内嵌地图。</p>
                <p>
                  请前往 <Link to="/settings">偏好设置</Link> 填写“地图展示授权码”。
                </p>
                <div className="map-action-row" style={{ justifyContent: "center", marginTop: "10px" }}>
                  <Link className="btn secondary" to="/settings" onClick={() => trackMapDiagnosticAction("settings", "MAP_KEY_MISSING")}>
                    去偏好设置
                  </Link>
                  <button className="btn text" type="button" onClick={() => runMapDiagnosticAction("timeline_only", "MAP_KEY_MISSING")}>
                    切换纯时间线模式
                  </button>
                </div>
              </div>
            </div>
          )}

          {itinerary && mapRenderMode === "map" && amapKey && (
            <>
              <div className="map-canvas" ref={mapContainerRef} />

              {mapStatus !== "ready" && (
                <div
                  className="map-empty"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(255,255,255,0.75)",
                    backdropFilter: "blur(2px)",
                  }}
                >
                  <div>
                    <div>{mapStatus === "loading" ? "地图加载中..." : mapError || "地图初始化失败，请稍后重试。"}</div>
                    {mapStatus === "error" && (
                      <div className="map-action-row" style={{ justifyContent: "center", marginTop: "10px" }}>
                        <button className="btn secondary" type="button" onClick={() => runMapDiagnosticAction("retry", "MAP_RENDER_FAILED")}>
                          重试加载
                        </button>
                        <Link className="btn secondary" to="/settings" onClick={() => trackMapDiagnosticAction("settings", "MAP_RENDER_FAILED")}>
                          检查授权配置
                        </Link>
                        <button className="btn text" type="button" onClick={() => runMapDiagnosticAction("timeline_only", "MAP_RENDER_FAILED")}>
                          纯时间线模式
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {mapStatus === "ready" && filteredMapPoints.length === 0 && (
                <div
                  className="map-empty"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(255,255,255,0.65)",
                    backdropFilter: "blur(2px)",
                  }}
                >
                  <div>
                    <div>当前筛选范围内没有可展示的坐标点。</div>
                    <div className="map-action-row" style={{ justifyContent: "center", marginTop: "10px" }}>
                      {!!mapDayFilter && (
                        <button className="btn secondary" type="button" onClick={() => runMapDiagnosticAction("clear_filter", "MAP_COORD_MISSING")}>
                          清空天数筛选
                        </button>
                      )}
                      <button className="btn text" type="button" onClick={() => runMapDiagnosticAction("timeline_only", "MAP_COORD_MISSING")}>
                        切换纯时间线模式
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="map-overlay">
                <div className="map-hint">
                  {activePoint ? `已高亮：${activePoint.poi}` : "点击右侧时间线，可在地图上定位对应点位"}
                </div>
                <div className="map-hint" style={{ pointerEvents: "auto", display: "grid", gap: "8px" }}>
                  <label style={{ fontSize: "12px", color: "#4b647a" }}>地图筛选</label>
                  <select
                    value={mapDayFilter}
                    onChange={(e) => setMapDayFilter(e.target.value)}
                    disabled={viewMode === "today" && !!todayMeta.todayDayValue}
                    style={{ border: "1px solid rgba(29,48,68,0.2)", borderRadius: "10px", padding: "6px 8px" }}
                  >
                    <option value="">全部天数</option>
                    {mapDayOptions.map((item: any) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {viewMode === "today" && !!todayMeta.todayDayValue && (
                    <span style={{ fontSize: "12px", color: "#4b647a" }}>今天模式下地图已自动锁定当天</span>
                  )}
                  {activePoint?.mapUrl && (
                    <a className="inline-link" href={activePoint.mapUrl} target="_blank" rel="noreferrer">
                      在高德中查看该点位
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="card timeline-card">
          {!itinerary && <div className="empty-block">生成后会在这里展示按小时的行程时间线。</div>}
          {itinerary && viewMode === "today" && !timelineDays.length && (
            <div className="empty-block">今天不在本次行程日期范围内，可切换“全部行程”查看完整安排。</div>
          )}

          {itinerary &&
            timelineDays.map((day: any, dayIdx: number) => (
              <section key={`${day.date || "day"}-${dayIdx}`} className="timeline-day">
                <h3>
                  第 {Number(day.day_index ?? dayIdx) + 1} 天 · {day.date || ""}
                </h3>

                {(day.blocks || []).map((block: any, blockIdx: number) => {
                  const blockKey = `${Number(day.day_index ?? dayIdx)}-${blockIdx}`;
                  const executionMeta = blockExecutionMeta(day, dayIdx, block, blockIdx);
                  const isTodayExecutionDay = viewMode === "today" && Number(day.day_index ?? dayIdx) === Number(todayMeta.todayDayValue);
                  const blockStatus = isTodayExecutionDay ? normalizeExecutionStatus(executionByBlock[executionMeta.stateKey] || "pending") : "pending";
                  const isExecutionSaving = executionSavingKey === executionMeta.stateKey;
                  const isActive = activeBlockKey === blockKey;
                  const isCurrent = viewMode === "today" && todayMeta.currentBlockKey === blockKey;
                  const isNext = viewMode === "today" && !isCurrent && todayMeta.nextBlockKey === blockKey;
                  return (
                    <article
                      id={`timeline-${blockKey}`}
                      className={`block-item${isActive ? " active" : ""}${isCurrent ? " is-current" : ""}${isNext ? " is-next" : ""}${
                        isTodayExecutionDay ? ` execution-${blockStatus}` : ""
                      }`}
                      key={blockKey}
                      onClick={() => focusBlockOnMap(blockKey)}
                    >
                      <div className="block-time">
                        {padHour(block.start_hour)}:00 - {padHour(block.end_hour)}:00
                      </div>
                      <div className="block-main">
                        <div className="block-title-row">
                          <strong>{block.title || "活动安排"}</strong>
                          <div className="block-chip-row">
                            {isTodayExecutionDay && (
                              <span className={`execution-chip ${blockStatus}`}>
                                {blockStatus === "done" ? "已完成" : blockStatus === "skipped" ? "已跳过" : "待执行"}
                              </span>
                            )}
                            <span className={`lock-chip${block.locked ? " on" : ""}`}>{block.locked ? "已锁定" : "未锁定"}</span>
                          </div>
                        </div>
                        <p>
                          {block.poi || "行程安排"}
                          {block.weather_risk ? ` · ${block.weather_risk}` : ""}
                          {block.locked && block.lock_reason ? ` · ${block.lock_reason}` : ""}
                        </p>
                        <div className="block-meta">
                          {isTodayExecutionDay && (
                            <div className="execution-action-row">
                              <button
                                className={`btn secondary block-exec-btn${blockStatus === "done" ? " active" : ""}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void updateBlockExecutionStatus(day, dayIdx, block, blockIdx, "done");
                                }}
                                disabled={loading || executionSyncing || isExecutionSaving}
                              >
                                标记完成
                              </button>
                              <button
                                className={`btn secondary block-exec-btn${blockStatus === "skipped" ? " active" : ""}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void updateBlockExecutionStatus(day, dayIdx, block, blockIdx, "skipped");
                                }}
                                disabled={loading || executionSyncing || isExecutionSaving}
                              >
                                跳过
                              </button>
                              {blockStatus !== "pending" && (
                                <button
                                  className="btn text block-exec-btn"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void updateBlockExecutionStatus(day, dayIdx, block, blockIdx, "pending");
                                  }}
                                  disabled={loading || executionSyncing || isExecutionSaving}
                                >
                                  重置
                                </button>
                              )}
                            </div>
                          )}
                          <button
                            className="btn secondary block-lock-btn"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleBlockLock(day, dayIdx, block, !Boolean(block.locked));
                            }}
                            disabled={loading}
                          >
                            {block.locked ? "解锁" : "锁定"}
                          </button>
                          {!!block.poi_map_url && (
                            <a
                              className="inline-link"
                              href={block.poi_map_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              在高德中查看
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
        </aside>
      </main>

      <section className="trip-bottom">
        <section className="card summary-panel">
          <div className="summary-head">
            <h2>快速优化这趟行程</h2>
            <p>选择你想调整的方向，我会只重算受影响时段。</p>
          </div>

          <div className="window-replan-box">
            <strong className="window-replan-head">按小时窗口重排</strong>
            <div className="window-replan-grid">
              <div className="field-row">
                <label>目标天数</label>
                <select className="field" value={windowDayIndex} onChange={(e) => setWindowDayIndex(e.target.value)}>
                  {!mapDayOptions.length && <option value="">暂无可选天数</option>}
                  {mapDayOptions.map((item: any) => (
                    <option key={`window-day-${item.value}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label>开始小时</label>
                <select className="field" value={windowStartHour} onChange={(e) => setWindowStartHour(e.target.value)}>
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={`window-start-${hour}`} value={String(hour)}>
                      {padHour(hour)}:00
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label>结束小时</label>
                <select className="field" value={windowEndHour} onChange={(e) => setWindowEndHour(e.target.value)}>
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={`window-end-${hour}`} value={String(hour)}>
                      {padHour(hour)}:00
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={keepLockedForWindow}
                onChange={(e) => setKeepLockedForWindow(e.target.checked)}
              />
              保留已锁定时段
            </label>
            <button
              className="btn secondary"
              type="button"
              onClick={() => void applyWindowReplan()}
              disabled={loading || !itinerary || !windowDayIndex}
            >
              应用窗口重排
            </button>
          </div>

          <div className="intent-row">
            {REPLAN_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`intent-btn ${intent === option.id ? "active" : ""}`}
                type="button"
                onClick={() => setIntent(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="field-row">
            <label>影响天数（可选）</label>
            <select className="field" value={dayIndex} onChange={(e) => setDayIndex(e.target.value)}>
              <option value="">全部天数</option>
              {mapDayOptions.map((item: any) => (
                <option key={`intent-day-${item.value}`} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <label>补充信息（按需）</label>
            <input className="field" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>

          <button className="btn primary" type="button" onClick={() => void applyReplan()} disabled={loading || !itinerary}>
            应用优化
          </button>

          <div style={{ marginTop: "12px" }}>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>版本历史与回退</strong>
            {!activePlanId && <div className="warning-item">请先保存行程，才能使用版本回退。</div>}
            {activePlanId && (
              <div className="warning-list">
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => void refreshVersions(activePlanId)}
                  disabled={versionsLoading || loading}
                >
                  {versionsLoading ? "加载中..." : "刷新版本列表"}
                </button>

                {!versionsLoading && versions.length === 0 && <div className="warning-item">暂无历史版本。</div>}

                {versions.map((version: any) => {
                  const versionNumber = Number(version.version || 0);
                  const currentVersion = Number(itinerary?.version || 0);
                  const isCurrent = versionNumber === currentVersion;
                  return (
                    <div key={`version-${versionNumber}`} className="warning-item">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
                        <div>
                          <strong>v{versionNumber}</strong>
                          <div style={{ color: "#4b647a", fontSize: "0.82rem" }}>
                            {version.summary || "行程更新"} · {formatVersionTime(version.created_at)}
                          </div>
                        </div>
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => void applyRevert(versionNumber)}
                          disabled={loading || isCurrent || revertingVersion === versionNumber}
                        >
                          {revertingVersion === versionNumber ? "回退中..." : isCurrent ? "当前版本" : "回退到此版本"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: "12px" }} ref={preTripTaskPanelRef}>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>出发前清单</strong>
            {!activePlanId && <div className="warning-item">请先保存行程，再维护出发前清单。</div>}
            {activePlanId && (
              <div className="warning-list">
                {reminderProfile?.reminderEnabled && dueSoonPendingTasks.length > 0 && (
                  <div className="pretrip-reminder-banner">
                    <div>
                      <strong>有 {dueSoonPendingTasks.length} 项任务将在 24 小时内到期</strong>
                      <div className="pretrip-reminder-sub">建议优先处理，避免出发前遗漏关键事项。</div>
                    </div>
                    <button className="btn secondary" type="button" onClick={jumpToPreTripTaskPanel}>
                      查看即将到期
                    </button>
                  </div>
                )}

                <div className="task-toolbar">
                  <div className="intent-row">
                    <button
                      className={`intent-btn ${taskFilterMode === "all" ? "active" : ""}`}
                      type="button"
                      onClick={() => setTaskFilterMode("all")}
                    >
                      全部任务
                    </button>
                    <button
                      className={`intent-btn ${taskFilterMode === "due_soon_unfinished" ? "active" : ""}`}
                      type="button"
                      onClick={() => setTaskFilterMode("due_soon_unfinished")}
                    >
                      只看未完成 + 即将到期
                    </button>
                  </div>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => void refreshTasks(activePlanId)}
                    disabled={tasksLoading || tasksSaving}
                  >
                    {tasksLoading ? "加载中..." : "刷新清单"}
                  </button>
                </div>

                <div className="warning-item">
                  {!reminderProfile?.reminderEnabled && "你已在偏好设置中关闭提醒，当前仅展示清单状态。"}
                  {reminderProfile?.reminderEnabled &&
                    `浏览器提醒：${
                      notificationPermission === "granted"
                        ? "已授权"
                        : notificationPermission === "default"
                          ? "未授权"
                          : notificationPermission === "denied"
                            ? "已拒绝"
                            : "不支持"
                    }`}
                  {reminderProfile?.reminderEnabled && !reminderUnsupported && notificationPermission !== "granted" && (
                    <div style={{ marginTop: 8 }}>
                      <button className="btn secondary" type="button" onClick={() => void requestNotificationAccess()}>
                        开启浏览器提醒
                      </button>
                    </div>
                  )}
                </div>

                {reminderDenied && (
                  <div className="warning-item">浏览器通知已被拒绝，请在浏览器站点权限中开启后刷新页面。</div>
                )}
                {reminderUnsupported && (
                  <div className="warning-item">当前浏览器不支持桌面通知，系统将继续使用应用内提醒条。</div>
                )}

                {!tasksLoading && taskCards.length === 0 && <div className="warning-item">当前还没有出发前任务。</div>}
                {!tasksLoading && taskCards.length > 0 && visiblePreTripTasks.length === 0 && taskFilterMode === "due_soon_unfinished" && (
                  <div className="warning-item">当前没有“未完成且 24 小时内到期”的任务。</div>
                )}
                {visiblePreTripTasks.map((task: any) => {
                  const dueLabel = formatTaskDueLabel(task, itinerary);
                  const reminderLabel = task.reminder?.enabled
                    ? `提醒 T-${(task.reminder?.offset_hours || []).map((hour: number) => Math.floor(Number(hour) / 24)).join(" / T-")}`
                    : "提醒已关闭";
                  return (
                    <div key={`task-${task.id}`} className="task-row">
                      <div>
                        <strong>{task.title || "未命名任务"}</strong>
                        <div style={{ color: "#4b647a", fontSize: "0.82rem" }}>
                          {task.category || "general"}
                          {dueLabel ? ` · 最晚 ${dueLabel}` : ""}
                          {` · ${reminderLabel}`}
                        </div>
                      </div>
                      <select
                        className="field"
                        value={String(task.status || "todo")}
                        onChange={(e) => updateTaskStatus(String(task.id || ""), e.target.value)}
                        disabled={tasksSaving}
                      >
                        <option value="todo">待办</option>
                        <option value="done">已完成</option>
                        <option value="skipped">跳过</option>
                      </select>
                    </div>
                  );
                })}
                {!!taskCards.length && (
                  <button className="btn primary" type="button" onClick={() => void persistTasks()} disabled={tasksSaving}>
                    {tasksSaving ? "保存中..." : "保存清单状态"}
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: "12px" }}>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>版本差异查看</strong>
            {!activePlanId && <div className="warning-item">请先保存行程，再查看版本差异。</div>}
            {activePlanId && (
              <div className="warning-list">
                <div className="diff-control-row">
                  <div className="field-row">
                    <label>起始版本</label>
                    <select className="field" value={diffFromVersion} onChange={(e) => setDiffFromVersion(e.target.value)}>
                      <option value="">请选择</option>
                      {[...versions]
                        .sort((a: any, b: any) => Number(a.version || 0) - Number(b.version || 0))
                        .map((version: any) => (
                          <option key={`from-v-${version.version}`} value={String(version.version)}>
                            v{version.version}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field-row">
                    <label>目标版本</label>
                    <select className="field" value={diffToVersion} onChange={(e) => setDiffToVersion(e.target.value)}>
                      <option value="">请选择</option>
                      {[...versions]
                        .sort((a: any, b: any) => Number(a.version || 0) - Number(b.version || 0))
                        .map((version: any) => (
                          <option key={`to-v-${version.version}`} value={String(version.version)}>
                            v{version.version}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <button className="btn secondary" type="button" onClick={() => void loadVersionDiff()} disabled={diffLoading}>
                  {diffLoading ? "对比中..." : "查看差异"}
                </button>

                {!diffLoading && diffResult?.summary && (
                  <div className="warning-item">
                    变更区块 {Number(diffResult.summary.changed_blocks || 0)} 个 · 涉及天数
                    {(diffResult.summary.changed_days || []).length
                      ? ` ${(diffResult.summary.changed_days || []).map((day: any) => `第 ${Number(day) + 1} 天`).join("、")}`
                      : " 无"}
                  </div>
                )}

                {!diffLoading && diffDayOptions.length > 0 && (
                  <div className="field-row">
                    <label>按天过滤（可选）</label>
                    <select className="field" value={diffDayFilter} onChange={(e) => setDiffDayFilter(e.target.value)}>
                      <option value="">全部天数</option>
                      {diffDayOptions.map((item: any) => (
                        <option key={`diff-day-${item.value}`} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {diffItems.length > 0 && (
                  <div className="warning-list">
                    {!filteredDiffItems.length && <div className="warning-item">当前筛选天数下没有差异项。</div>}
                    {filteredDiffItems.map((item: any, idx: number) => {
                      const oldPoi = String(item?.old?.poi || "-");
                      const newPoi = String(item?.new?.poi || "-");
                      const oldLocked = Boolean(item?.old?.locked);
                      const newLocked = Boolean(item?.new?.locked);
                      const poiChanged = oldPoi !== newPoi;
                      const lockChanged = oldLocked !== newLocked;
                      return (
                        <div key={`diff-item-${idx}`} className={`warning-item diff-item-card${poiChanged || lockChanged ? " changed" : ""}`}>
                          <div className="diff-main-line">
                            第 {Number(item.day_index || 0) + 1} 天 {padHour(Number(item.start_hour || 0))}:00-{padHour(Number(item.end_hour || 0))}:00
                          </div>
                          <div className="diff-chip-row">
                            {poiChanged ? (
                              <>
                                <span className="diff-chip">POI 变更</span>
                                <span className="diff-old">{oldPoi}</span>
                                <span className="diff-arrow">{"->"}</span>
                                <span className="diff-new">{newPoi}</span>
                              </>
                            ) : (
                              <span className="diff-same">POI 未变化：{newPoi}</span>
                            )}
                          </div>
                          <div className="diff-chip-row">
                            {lockChanged ? (
                              <>
                                <span className="diff-chip">锁定状态</span>
                                <span className="diff-old">{oldLocked ? "锁定" : "未锁定"}</span>
                                <span className="diff-arrow">{"->"}</span>
                                <span className="diff-new">{newLocked ? "锁定" : "未锁定"}</span>
                              </>
                            ) : (
                              <span className="diff-same">锁定状态未变化：{newLocked ? "锁定" : "未锁定"}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="card summary-panel">
          <div className="summary-head">
            <h2>执行提醒</h2>
            <p>天气、交通和行程衔接会集中展示在这里。</p>
          </div>

          <div>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>地图诊断</strong>
            <div className="warning-list">
              {!mapDiagnostics.length && <div className="warning-item">地图状态正常，可按点位导航执行。</div>}
              {mapDiagnostics.map((item: any, idx: number) => (
                <div key={`map-diag-${idx}`} className="warning-item">
                  <strong>{item.code || "MAP_DIAGNOSTIC"}</strong>
                  <div>{item.message || "地图状态异常，请检查后重试。"}</div>
                  <div className="map-action-row" style={{ marginTop: "8px" }}>
                    {Array.isArray(item.actions) && item.actions.includes("retry") && (
                      <button className="btn secondary" type="button" onClick={() => runMapDiagnosticAction("retry", item.code)}>
                        重试地图
                      </button>
                    )}
                    {Array.isArray(item.actions) && item.actions.includes("settings") && (
                      <Link className="btn secondary" to="/settings" onClick={() => trackMapDiagnosticAction("settings", item.code)}>
                        打开偏好设置
                      </Link>
                    )}
                    {Array.isArray(item.actions) && item.actions.includes("timeline_only") && (
                      <button className="btn text" type="button" onClick={() => runMapDiagnosticAction("timeline_only", item.code)}>
                        纯时间线模式
                      </button>
                    )}
                    {Array.isArray(item.actions) && item.actions.includes("restore_map") && (
                      <button className="btn secondary" type="button" onClick={() => runMapDiagnosticAction("restore_map", item.code)}>
                        恢复地图模式
                      </button>
                    )}
                    {Array.isArray(item.actions) && item.actions.includes("clear_filter") && (
                      <button className="btn text" type="button" onClick={() => runMapDiagnosticAction("clear_filter", item.code)}>
                        清空地图筛选
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>本次改动</strong>
            <div className="warning-list">
              {!changes.length && <div className="warning-item">本次没有可展示的改动明细。</div>}
              {changes.map((item: any, idx: number) => (
                <div key={`change-${idx}`} className="warning-item">
                  {summarizeChange(item)}
                </div>
              ))}
            </div>
          </div>

          <div>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>冲突提醒</strong>
            <div className="warning-list">
              {!conflicts.length && <div className="warning-item">当前没有冲突。</div>}
              {conflicts.map((item: any, idx: number) => (
                <div key={`conflict-${idx}`} className="warning-item">
                  {item.message || item.code || "存在冲突，请调整后重试。"}
                </div>
              ))}
            </div>
          </div>

          <div>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>交通建议</strong>
            <div className="transit-list">
              {!(itinerary?.transit_legs || []).length && <div className="transit-item">暂无交通段信息。</div>}
              {(itinerary?.transit_legs || []).map((leg: any, idx: number) => (
                <div className="transit-item" key={`${leg.from_poi || "from"}-${idx}`}>
                  <div>
                    第 {Number(leg.day_index || 0) + 1} 天 · {leg.from_poi || "起点"} {"->"} {leg.to_poi || "终点"} · 约 {leg.minutes || "-"} 分钟
                  </div>
                  {!!leg.navigation_url && (
                    <a className="inline-link" href={leg.navigation_url} target="_blank" rel="noreferrer">
                      高德导航
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>风险提醒</strong>
            <div className="warning-list">
              {!riskDiagnostics.length && !warnings.length && <div className="warning-item">当前行程没有明显风险提醒。</div>}

              {riskDiagnostics.map((item: any, idx: number) => {
                const action = normalizeRiskAction(item?.action);
                const targetDay = Number(item?.target?.day_index ?? -1);
                const targetBlock = String(item?.target?.block_id || "").trim();
                const actionKey = `${String(item?.code || "UNKNOWN_RISK")}|${targetDay}|${targetBlock}|${idx}`;
                const showActionBtn = ["replan_window", "add_pretrip_task", "open_external_link"].includes(action.type);
                return (
                  <div key={actionKey} className="warning-item risk-item">
                    <div className="risk-head-row">
                      <strong>{String(item?.code || "RISK_DIAGNOSTIC")}</strong>
                      <span className={`risk-level ${String(item?.level || "info").toLowerCase()}`}>
                        {String(item?.level || "info").toLowerCase()}
                      </span>
                    </div>
                    <div>{String(item?.message || "检测到风险项，请按提示处理。")}</div>
                    {!!(Number.isInteger(targetDay) && targetDay >= 0) && (
                      <div className="risk-target">目标：第 {targetDay + 1} 天{targetBlock ? ` · ${targetBlock}` : ""}</div>
                    )}
                    {showActionBtn && (
                      <div className="map-action-row" style={{ marginTop: "8px" }}>
                        <button
                          className="btn secondary"
                          type="button"
                          onClick={() => void runRiskDiagnosticAction(item, idx)}
                          disabled={loading || tasksSaving || riskActionLoadingKey === actionKey}
                        >
                          {riskActionLoadingKey === actionKey ? "处理中..." : action.label}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {warnings.map((item: string, idx: number) => (
                <div key={`warning-${idx}-${item}`} className="warning-item">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </>
  );
}






















