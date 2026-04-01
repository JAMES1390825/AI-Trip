import React, { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { TripApiClient } from "../../api/client";
import { RUNTIME_CONFIG } from "../../config/runtime";
import {
  type BudgetLevel,
  type CommunityPost,
  type DestinationEntity,
  type PaceLevel,
  type PlanDraft,
  type PlanningBriefRequest,
} from "../../types/plan";
import { defaultStartDate } from "../../utils/date";
import { extractPrimaryItinerary, toItineraryView } from "../../utils/itinerary";
import { PlannerScreen } from "../PlannerScreen";
import { DatePickerSheet } from "./DatePickerSheet";
import { DestinationSearchView } from "./DestinationSearchView";
import { GeneratingView } from "./GeneratingView";
import { MapResultView } from "./MapResultView";
import { PlanEntryView } from "./PlanEntryView";

type MapFlowScreenProps = {
  preloadedItinerary?: Record<string, unknown> | null;
  preloadedToken?: number;
  communitySeed?: { destination: string; postIds: string[] } | null;
  communitySeedToken?: number;
  onPlanSaved?: (savedPlanId: string, itinerary: Record<string, unknown>) => void;
};

type FlowMode = "entry" | "search" | "generating" | "result" | "legacy-planner";

const generatingPhases = [
  "正在确认目的地与规划 brief",
  "正在组装候选点位与路线证据",
  "正在排布每日动线与时间窗口",
  "正在校验可信度与降级状态",
];

function isSameDestinationText(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function formatSuccessText(itinerary: Record<string, unknown> | null): string {
  const view = toItineraryView(itinerary);
  if (!view) return "已生成地图行程";
  const firstDay = view.days[0];
  const firstPoi = firstDay?.blocks[0]?.poi || "";
  if (firstPoi) {
    return `${view.destination || "目的地"} ${view.days.length} 天已生成，建议先看 ${firstPoi}`;
  }
  return `${view.destination || "目的地"} ${view.days.length} 天已生成`;
}

export function MapFlowScreen({
  preloadedItinerary = null,
  preloadedToken = 0,
  communitySeed = null,
  communitySeedToken = 0,
  onPlanSaved,
}: MapFlowScreenProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const requestIdRef = useRef(0);
  const [flowMode, setFlowMode] = useState<FlowMode>("entry");
  const [destination, setDestination] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<DestinationEntity | null>(null);
  const [startDate, setStartDate] = useState(defaultStartDate(15));
  const [days, setDays] = useState(3);
  const [flexibleDays, setFlexibleDays] = useState(false);
  const [travelStyles, setTravelStyles] = useState<string[]>([]);
  const [budget, setBudget] = useState<BudgetLevel>("medium");
  const [pace, setPace] = useState<PaceLevel>("relaxed");
  const [mustGo, setMustGo] = useState<string[]>([]);
  const [planningNote, setPlanningNote] = useState("");
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [referencedCommunityPostIDs, setReferencedCommunityPostIDs] = useState<string[]>([]);
  const [seededCommunityDestination, setSeededCommunityDestination] = useState("");
  const [entryStatus, setEntryStatus] = useState("填好目的地、日期和偏好，就能开始 AI 规划。");
  const [clarificationQuestion, setClarificationQuestion] = useState("");
  const [suggestedOptions, setSuggestedOptions] = useState<string[]>([]);
  const [briefNextAction, setBriefNextAction] = useState("");
  const [generatedItinerary, setGeneratedItinerary] = useState<Record<string, unknown> | null>(null);
  const [generatedToken, setGeneratedToken] = useState(0);
  const [generatingPhaseIndex, setGeneratingPhaseIndex] = useState(0);
  const [legacyEntryToken, setLegacyEntryToken] = useState(0);
  const [legacyReturnMode, setLegacyReturnMode] = useState<"entry" | "result">("entry");
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (flowMode !== "generating") return;
    const timer = setInterval(() => {
      setGeneratingPhaseIndex((prev) => (prev + 1) % generatingPhases.length);
    }, 1100);
    return () => clearInterval(timer);
  }, [flowMode]);

  useEffect(() => {
    if (!preloadedToken || !preloadedItinerary) return;
    setGeneratedItinerary(preloadedItinerary);
    setGeneratedToken((prev) => prev + 1);
    setEntryStatus("已载入保存行程，可继续查看和调整。");
    setClarificationQuestion("");
    setSuggestedOptions([]);
    setBriefNextAction("");
    setFlowMode("result");
  }, [preloadedItinerary, preloadedToken]);

  useEffect(() => {
    if (!communitySeedToken || !communitySeed) return;
    const nextDestination = String(communitySeed.destination || "").trim();
    const nextPostIds = Array.isArray(communitySeed.postIds)
      ? communitySeed.postIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    setDestination(nextDestination);
    setSelectedDestination(null);
    setReferencedCommunityPostIDs(nextPostIds);
    setSeededCommunityDestination(nextDestination);
    setEntryStatus("已带入一条旅途分享作为参考，你可以直接继续生成，也可以再补充自己的偏好。");
    setClarificationQuestion("");
    setSuggestedOptions([]);
    setBriefNextAction("");
    setFlowMode("entry");
  }, [communitySeed, communitySeedToken]);

  useEffect(() => {
    let cancelled = false;
    const destinationId = selectedDestination?.destination_id?.trim() || "";
    const destinationLabel = (selectedDestination?.destination_label || destination).trim();
    if (!destinationId && !destinationLabel) {
      setCommunityPosts([]);
      setReferencedCommunityPostIDs([]);
      setSeededCommunityDestination("");
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const items = await api.listCommunityPosts({
          destinationId,
          destinationLabel,
          limit: 6,
        });
        if (cancelled) return;
        setCommunityPosts(items);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setCommunityPosts([]);
        if (referencedCommunityPostIDs.length > 0) {
          setEntryStatus(`已保留外部带入的旅途分享参考，社区候选池读取失败：${message}`);
        } else {
          setEntryStatus("已按目的地生成基础规划条件，社区候选池暂时不可用。");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, destination, referencedCommunityPostIDs.length, selectedDestination]);

  useEffect(() => {
    if (!referencedCommunityPostIDs.length || !seededCommunityDestination.trim()) return;
    if (isSameDestinationText(destination, seededCommunityDestination)) return;
    setReferencedCommunityPostIDs([]);
    setSeededCommunityDestination("");
  }, [destination, referencedCommunityPostIDs.length, seededCommunityDestination]);

  const effectiveCommunityPostIDs = useMemo(() => {
    const manual = Array.from(new Set(referencedCommunityPostIDs.map((item) => item.trim()).filter(Boolean)));
    if (manual.length) return manual.slice(0, 3);
    return communityPosts.map((item) => item.id).filter(Boolean).slice(0, 3);
  }, [communityPosts, referencedCommunityPostIDs]);

  function toggleStyle(style: string) {
    setTravelStyles((prev) => {
      if (prev.includes(style)) {
        return prev.filter((item) => item !== style);
      }
      return [...prev, style];
    });
  }

  function buildPlanningBriefRequest(): PlanningBriefRequest {
    return {
      origin_city: "上海",
      destination_text: destination.trim(),
      selected_destination: selectedDestination,
      days,
      start_date: startDate.trim(),
      budget_level: budget,
      pace,
      travel_styles: travelStyles,
      must_go: mustGo,
      avoid: [],
      free_text: planningNote.trim(),
    };
  }

  async function handleSmartGenerate() {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setEntryStatus("正在整理你的规划条件...");
    setClarificationQuestion("");
    setSuggestedOptions([]);
    setBriefNextAction("");

    try {
      const briefResponse = await api.createPlanningBrief(buildPlanningBriefRequest());
      if (requestIdRef.current !== requestId) return;

      const brief = briefResponse.planning_brief;
      if (brief.destination) {
        setSelectedDestination(brief.destination);
        setDestination(brief.destination.destination_label);
      }
      if (brief.days > 0) {
        setDays(brief.days);
      }
      if (brief.start_date.trim()) {
        setStartDate(brief.start_date);
      }
      setBudget(brief.budget_level);
      setPace(brief.pace);
      setTravelStyles(brief.travel_styles);
      setMustGo(brief.must_go);
      setClarificationQuestion(String(briefResponse.clarification_question || "").trim());
      setSuggestedOptions(Array.isArray(briefResponse.suggested_options) ? briefResponse.suggested_options.map((item) => String(item || "").trim()).filter(Boolean) : []);
      setBriefNextAction(String(briefResponse.next_action || "").trim());

      const briefMessage = briefResponse.assistant_message?.trim() || "";
      if (!brief.ready_to_generate) {
        setEntryStatus(briefMessage || "信息还不完整，暂时还不能开始生成。");
        setFlowMode("entry");
        return;
      }

      void api.trackEvent("preference_changed", {
        destination: brief.destination?.destination_label || destination.trim(),
        destination_adcode: brief.destination?.adcode || "",
        budget_level: brief.budget_level,
        pace: brief.pace,
        travel_styles: brief.travel_styles,
        weather_preference: brief.constraints.weather_preference || "",
        dining_preference: brief.constraints.dining_preference || "",
        community_post_ids: effectiveCommunityPostIDs,
      }).catch(() => undefined);

      setGeneratingPhaseIndex(0);
      setEntryStatus(briefMessage || "已整理规划信息，开始生成路线。");
      setFlowMode("generating");

      const result = await api.generatePlanV2(brief, {
        variants: 1,
        allowFallback: true,
        communityPostIds: effectiveCommunityPostIDs,
      });
      if (requestIdRef.current !== requestId) return;
      const primary = extractPrimaryItinerary(result);
      if (!primary || !Object.keys(primary).length) {
        throw new Error("generate-v2 没有返回可用行程");
      }
      setGeneratedItinerary(primary);
      setGeneratedToken((prev) => prev + 1);
      setEntryStatus(formatSuccessText(primary));
      setClarificationQuestion("");
      setSuggestedOptions([]);
      setBriefNextAction("");
      setFlowMode("result");
      void api.trackEvent("plan_generated", {
        destination: brief.destination?.destination_label || destination.trim(),
        destination_adcode: brief.destination?.adcode || "",
        days: brief.days,
        budget_level: brief.budget_level,
        pace: brief.pace,
        travel_styles: brief.travel_styles,
        community_post_ids: effectiveCommunityPostIDs,
        source_mode: String(primary.source_mode || ""),
      }).catch(() => undefined);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setEntryStatus(error instanceof Error ? error.message : String(error));
      setFlowMode("entry");
    }
  }

  function handleCancelGenerating() {
    requestIdRef.current += 1;
    setEntryStatus("已取消本次生成，刚才填写的内容还保留着。");
    setFlowMode("entry");
  }

  function handleApplySuggestedOption(option: string) {
    const value = option.trim();
    if (!value) return;

    switch (briefNextAction) {
      case "CONFIRM_DAYS": {
        const match = value.match(/(\d+)/);
        if (match) {
          setDays(Number(match[1]));
          setEntryStatus(`已采用建议天数：${match[1]} 天。`);
        }
        return;
      }
      case "CONFIRM_START_DATE":
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          setStartDate(value);
          setEntryStatus(`已采用建议日期：${value}。`);
        }
        return;
      case "CONFIRM_DESTINATION":
        setDestination(value);
        setSelectedDestination(null);
        setEntryStatus(`已填入建议目的地：${value}，请再从搜索结果里确认标准城市。`);
        setFlowMode("search");
        return;
      default:
        if (!planningNote.includes(value)) {
          setPlanningNote((prev) => (prev.trim() ? `${prev.trim()}；${value}` : value));
        }
        setEntryStatus(`已记录补充偏好：${value}。`);
    }
  }

  function handleManualPlan() {
    setLegacyReturnMode("entry");
    setLegacyEntryToken((prev) => prev + 1);
    setFlowMode("legacy-planner");
  }

  const legacyPreset = useMemo<Partial<PlanDraft>>(
    () => ({
      origin_city: "上海",
      destination: destination.trim(),
      destination_entity: selectedDestination,
      days,
      budget_level: budget,
      companions: ["朋友"],
      travel_styles: travelStyles,
      must_go: mustGo,
      avoid: [],
      start_date: startDate.trim(),
      pace,
    }),
    [budget, days, destination, mustGo, pace, selectedDestination, startDate, travelStyles],
  );

  const destinationNote = useMemo(() => {
    if (!destination.trim()) return "";
    if (!selectedDestination) {
      return "建议从搜索结果里确认一个标准目的地，避免后续规划只靠字符串猜测。";
    }
    if (selectedDestination.match_type === "custom") {
      return "当前是自定义目的地描述，正式 AI 规划前还需要先确认到具体城市或区域。";
    }

    const location = [selectedDestination.country, selectedDestination.region].filter(Boolean).join(" · ");
    return location ? `已确认标准目的地 · ${location}` : "已确认标准目的地";
  }, [destination, selectedDestination]);

  if (flowMode === "generating") {
    return (
      <GeneratingView
        destination={destination.trim()}
        days={days}
        phases={generatingPhases}
        currentPhaseIndex={generatingPhaseIndex}
        onCancel={handleCancelGenerating}
      />
    );
  }

  if (flowMode === "legacy-planner") {
    return (
      <PlannerScreen
        preloadedItinerary={legacyReturnMode === "result" ? generatedItinerary : null}
        preloadedToken={legacyReturnMode === "result" ? generatedToken : 0}
        entryPreset={legacyPreset}
        entryPresetToken={legacyEntryToken}
        onBackFromResult={() => setFlowMode(legacyReturnMode)}
        onPlanSaved={onPlanSaved}
      />
    );
  }

  if (flowMode === "result" && generatedItinerary) {
    return (
      <MapResultView
        itinerary={generatedItinerary}
        onBack={() => setFlowMode("entry")}
        onOpenLegacyEditor={(nextItinerary) => {
          setLegacyReturnMode("result");
          setGeneratedItinerary(nextItinerary);
          setGeneratedToken((prev) => prev + 1);
          setFlowMode("legacy-planner");
        }}
        onPlanSaved={onPlanSaved}
      />
    );
  }

  if (flowMode === "search") {
    return (
      <DestinationSearchView
        initialQuery={destination}
        onBack={() => setFlowMode("entry")}
        onSelectDestination={(value) => {
          setSelectedDestination(value);
          setDestination(value.destination_label);
          setClarificationQuestion("");
          setSuggestedOptions([]);
          setBriefNextAction("");
          if (value.match_type === "custom") {
            setEntryStatus(`已记录自定义目的地：${value.destination_label}。后续需要先确认标准城市或区域。`);
          } else {
            const suffix = [value.country, value.region].filter(Boolean).join(" · ");
            setEntryStatus(suffix ? `已确认目的地：${value.destination_label} · ${suffix}` : `已确认目的地：${value.destination_label}`);
          }
          setFlowMode("entry");
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <PlanEntryView
        destination={destination}
        planningNote={planningNote}
        startDate={startDate}
        days={days}
        flexibleDays={flexibleDays}
        selectedStyles={travelStyles}
        destinationNote={destinationNote}
        budget={budget}
        pace={pace}
        status={entryStatus}
        onChangeDays={setDays}
        onToggleStyle={toggleStyle}
        onSelectBudget={setBudget}
        onSelectPace={setPace}
        onOpenDestinationSearch={() => setFlowMode("search")}
        onOpenDatePicker={() => setShowDatePicker(true)}
        onChangePlanningNote={setPlanningNote}
        clarificationQuestion={clarificationQuestion}
        suggestedOptions={suggestedOptions}
        onApplySuggestedOption={handleApplySuggestedOption}
        onPressSmartGenerate={() => void handleSmartGenerate()}
        onPressManualPlan={handleManualPlan}
      />
      <DatePickerSheet
        visible={showDatePicker}
        startDate={startDate}
        days={days}
        flexibleDays={flexibleDays}
        onClose={() => setShowDatePicker(false)}
        onConfirm={() => {
          setShowDatePicker(false);
          setEntryStatus(`已更新日期：${startDate} · ${days} 天`);
        }}
        onSelectStartDate={setStartDate}
        onSelectDays={setDays}
        onToggleFlexibleDays={() => setFlexibleDays((prev) => !prev)}
      />
    </View>
  );
}
