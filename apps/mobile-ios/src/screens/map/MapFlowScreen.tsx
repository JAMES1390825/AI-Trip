import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TripApiClient } from "../../api/client";
import { RUNTIME_CONFIG } from "../../config/runtime";
import { type DestinationEntity, type PlanningBriefRequest } from "../../types/plan";
import { defaultStartDate } from "../../utils/date";
import { extractPrimaryItinerary, toItineraryView } from "../../utils/itinerary";
import { GeneratingView } from "./GeneratingView";
import { MapResultView } from "./MapResultView";
import { PlanEntryView } from "./PlanEntryView";
import {
  applyDateRangeSelection,
  buildCalendarMonth,
  buildPlanningEntryFeedback,
  deriveDaysFromRange,
  isPlanningEntryReady,
} from "./planning-page-default-state";
import { extractPlanVariants, type PlanVariantView } from "./result-variants";

type MapFlowScreenProps = {
  preloadedItinerary?: Record<string, unknown> | null;
  preloadedToken?: number;
  onPlanSaved?: (savedPlanId: string, itinerary: Record<string, unknown>) => void;
};

type FlowMode = "entry" | "generating" | "result";

type GeoRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type MapLibraryModule = {
  default?: React.ComponentType<any>;
  Marker?: React.ComponentType<any>;
};

const generatingPhases = [
  "正在确认目的地与规划 brief",
  "正在组装候选点位与路线证据",
  "正在排布每日动线与时间窗口",
  "正在校验可信度与降级状态",
];

const defaultRegion: GeoRegion = {
  latitude: 31.2304,
  longitude: 121.4737,
  latitudeDelta: 0.22,
  longitudeDelta: 0.22,
};

function loadMapLibrary(): MapLibraryModule {
  try {
    return require("react-native-maps") as MapLibraryModule;
  } catch {
    return {};
  }
}

const mapLibrary = loadMapLibrary();
const NativeMapView = mapLibrary.default || null;
const NativeMarker = mapLibrary.Marker || null;

function endDateFromRange(startDate: string, totalDays: number): string {
  const parsed = Date.parse(startDate || "");
  if (!Number.isFinite(parsed) || totalDays <= 0) return "";
  const date = new Date(parsed);
  date.setDate(date.getDate() + totalDays - 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function mapRegionForDestination(destination: DestinationEntity | null): GeoRegion {
  if (!destination) return defaultRegion;
  if (!Number.isFinite(destination.center_lat) || !Number.isFinite(destination.center_lng)) return defaultRegion;
  return {
    latitude: destination.center_lat,
    longitude: destination.center_lng,
    latitudeDelta: 0.16,
    longitudeDelta: 0.16,
  };
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
  onPlanSaved,
}: MapFlowScreenProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const requestIdRef = useRef(0);
  const focusTriggerRef = useRef(0);
  const [flowMode, setFlowMode] = useState<FlowMode>("entry");
  const [destination, setDestination] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<DestinationEntity | null>(null);
  const [destinationSearchOpen, setDestinationSearchOpen] = useState(false);
  const [destinationResults, setDestinationResults] = useState<DestinationEntity[]>([]);
  const [destinationSearchStatus, setDestinationSearchStatus] = useState("");
  const [destinationSearchLoading, setDestinationSearchLoading] = useState(false);
  const [calendarAnchorDate, setCalendarAnchorDate] = useState(defaultStartDate(15));
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [days, setDays] = useState(0);
  const [travelStyles, setTravelStyles] = useState<string[]>([]);
  const [planningNote, setPlanningNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [entryStatus, setEntryStatus] = useState("先选目的地和日期，就能开始生成。");
  const [focusField, setFocusField] = useState<"destination" | "date_range" | null>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [generatedItinerary, setGeneratedItinerary] = useState<Record<string, unknown> | null>(null);
  const [generatedVariants, setGeneratedVariants] = useState<PlanVariantView[]>([]);
  const [generatingPhaseIndex, setGeneratingPhaseIndex] = useState(0);

  useEffect(() => {
    if (flowMode !== "generating") return;
    const timer = setInterval(() => {
      setGeneratingPhaseIndex((prev) => (prev + 1) % generatingPhases.length);
    }, 1100);
    return () => clearInterval(timer);
  }, [flowMode]);

  useEffect(() => {
    const nextDays = deriveDaysFromRange(startDate, endDate);
    if (nextDays !== days) {
      setDays(nextDays);
    }
  }, [days, endDate, startDate]);

  useEffect(() => {
    if (!destinationSearchOpen) {
      setDestinationResults([]);
      setDestinationSearchLoading(false);
      setDestinationSearchStatus("");
      return;
    }

    let cancelled = false;
    const query = destination.trim();

    if (!query) {
      setDestinationResults([]);
      setDestinationSearchStatus("输入城市或目的地关键词");
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      void (async () => {
        setDestinationSearchLoading(true);
        try {
          const response = await api.resolveDestinations(query, 8);
          if (cancelled) return;
          const items = response.items.filter((item) => Boolean(item.destination_label?.trim()));
          setDestinationResults(items);
          if (response.degraded && items.length) {
            setDestinationSearchStatus("当前结果来自降级匹配，建议继续确认标准城市。");
          } else if (!items.length) {
            setDestinationSearchStatus("没有更匹配的结果，换个关键词试试。");
          } else {
            setDestinationSearchStatus("");
          }
        } catch {
          if (cancelled) return;
          setDestinationResults([]);
          setDestinationSearchStatus("搜索暂不可用，请稍后再试。");
        } finally {
          if (!cancelled) {
            setDestinationSearchLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, destination, destinationSearchOpen]);

  useEffect(() => {
    if (!preloadedToken || !preloadedItinerary) return;
    setGeneratedItinerary(preloadedItinerary);
    setGeneratedVariants([]);
    setEntryStatus("已载入保存行程，可继续查看和调整。");
    setFlowMode("result");
  }, [preloadedItinerary, preloadedToken]);

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
      budget_level: "medium",
      pace: "relaxed",
      travel_styles: travelStyles,
      must_go: [],
      avoid: [],
      free_text: planningNote.trim(),
    };
  }

  const entryFeedback = useMemo(
    () =>
      buildPlanningEntryFeedback({
        destination,
        startDate,
        endDate,
      }),
    [destination, endDate, startDate],
  );

  const calendarMonth = useMemo(() => buildCalendarMonth(calendarAnchorDate), [calendarAnchorDate]);
  const mapRegion = useMemo(() => mapRegionForDestination(selectedDestination), [selectedDestination]);

  function focusFieldInSheet(nextField: "destination" | "date_range" | null) {
    setFocusField(nextField);
    focusTriggerRef.current += 1;
    setFocusTrigger(focusTriggerRef.current);
  }

  function handleCalendarDatePress(date: string) {
    const nextRange = applyDateRangeSelection(startDate, endDate, date);
    setStartDate(nextRange.startDate);
    setEndDate(nextRange.endDate);
    setCalendarAnchorDate(nextRange.startDate || date || defaultStartDate(15));

    if (nextRange.startDate && nextRange.endDate) {
      setDateRangeOpen(false);
      setEntryStatus(`已选择 ${nextRange.startDate} - ${nextRange.endDate}`);
      setFocusField(null);
      return;
    }

    setEntryStatus("请选择结束日期");
  }

  async function handleSmartGenerate() {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!isPlanningEntryReady({ destination, startDate, endDate })) {
      setEntryStatus(entryFeedback.message);
      if (entryFeedback.focusField === "destination") {
        setDestinationSearchOpen(true);
        focusFieldInSheet("destination");
      }
      if (entryFeedback.focusField === "date_range") {
        setDateRangeOpen(true);
        focusFieldInSheet("date_range");
      }
      return;
    }

    setEntryStatus("正在整理你的规划条件...");
    setFocusField(null);

    try {
      const briefResponse = await api.createPlanningBrief(buildPlanningBriefRequest());
      if (requestIdRef.current !== requestId) return;

      const brief = briefResponse.planning_brief;
      if (brief.destination) {
        setSelectedDestination(brief.destination);
        setDestination(brief.destination.destination_label);
      }
      if (brief.start_date.trim()) {
        setStartDate(brief.start_date);
      }
      if (brief.days > 0 && brief.start_date.trim()) {
        setEndDate(endDateFromRange(brief.start_date, brief.days));
      }
      setTravelStyles(brief.travel_styles);

      const briefMessage = briefResponse.assistant_message?.trim() || "";
      if (!brief.ready_to_generate) {
        setEntryStatus(briefMessage || entryFeedback.message || "信息还不完整，暂时还不能开始生成。");
        setFlowMode("entry");
        return;
      }

      setGeneratingPhaseIndex(0);
      setEntryStatus(briefMessage || "已整理规划信息，开始生成路线。");
      setFlowMode("generating");

      const result = await api.generatePlanV2(brief, {
        variants: 2,
        allowFallback: true,
      });
      if (requestIdRef.current !== requestId) return;
      const variants = extractPlanVariants(result);
      const primary = variants[0]?.itinerary || extractPrimaryItinerary(result);
      if (!primary || !Object.keys(primary).length) {
        throw new Error("generate-v2 没有返回可用行程");
      }
      setGeneratedVariants(variants);
      setGeneratedItinerary(primary);
      setEntryStatus(formatSuccessText(primary));
      setFlowMode("result");
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

  if (flowMode === "generating") {
    return (
      <GeneratingView
        destination={destination.trim()}
        days={days || 1}
        phases={generatingPhases}
        currentPhaseIndex={generatingPhaseIndex}
        onCancel={handleCancelGenerating}
      />
    );
  }

  if (flowMode === "result" && generatedItinerary) {
    return (
      <MapResultView
        itinerary={generatedItinerary}
        variants={generatedVariants}
        onBack={() => setFlowMode("entry")}
        onPlanSaved={onPlanSaved}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.mapWrap}>
        {NativeMapView ? (
          <NativeMapView style={styles.nativeMap} region={mapRegion}>
            {NativeMarker && selectedDestination ? (
              <NativeMarker
                coordinate={{
                  latitude: selectedDestination.center_lat,
                  longitude: selectedDestination.center_lng,
                }}
                title={selectedDestination.destination_label}
              />
            ) : null}
          </NativeMapView>
        ) : (
          <View style={styles.mapFallback}>
            <View style={styles.mapGrid} />
            <View style={[styles.mapPin, { left: "24%", top: "26%" }]} />
            <View style={[styles.mapPin, styles.mapPinAlt, { left: "58%", top: "42%" }]} />
            <View style={[styles.mapPin, styles.mapPinWarm, { left: "42%", top: "64%" }]} />
          </View>
        )}

        <View style={styles.topChrome}>
          <View style={styles.chromeButton}>
            <Text style={styles.chromeButtonText}>返回</Text>
          </View>
          <View style={styles.chromeActions}>
            <View style={styles.chromeButton}>
              <Text style={styles.chromeButtonText}>搜索</Text>
            </View>
            <View style={[styles.chromeButton, styles.chromeButtonPrimary]}>
              <Text style={styles.chromeButtonPrimaryText}>AI 行程</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.sheetWrap}>
        <PlanEntryView
          destination={destination}
          destinationSearchOpen={destinationSearchOpen}
          destinationResults={destinationResults}
          destinationSearchStatus={destinationSearchStatus}
          destinationSearchLoading={destinationSearchLoading}
          dateRangeOpen={dateRangeOpen}
          startDate={startDate}
          endDate={endDate}
          days={days}
          selectedStyles={travelStyles}
          planningNote={planningNote}
          noteOpen={noteOpen}
          topHint={entryStatus}
          focusField={focusField}
          focusTrigger={focusTrigger}
          calendarMonth={calendarMonth}
          onChangeDestination={(value) => {
            setDestination(value);
            setSelectedDestination(null);
            setDestinationSearchOpen(true);
          }}
          onToggleDestinationSearch={() => setDestinationSearchOpen((prev) => !prev)}
          onSelectDestination={(value) => {
            setSelectedDestination(value);
            setDestination(value.destination_label);
            setDestinationSearchOpen(false);
            setEntryStatus(`已选择 ${value.destination_label}`);
            setFocusField(null);
          }}
          onToggleDateRange={() => setDateRangeOpen((prev) => !prev)}
          onPressCalendarDate={handleCalendarDatePress}
          onPreviousMonth={() => {
            const parsed = Date.parse(calendarAnchorDate || defaultStartDate(15));
            const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
            date.setMonth(date.getMonth() - 1);
            const month = String(date.getMonth() + 1).padStart(2, "0");
            setCalendarAnchorDate(`${date.getFullYear()}-${month}-01`);
          }}
          onNextMonth={() => {
            const parsed = Date.parse(calendarAnchorDate || defaultStartDate(15));
            const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
            date.setMonth(date.getMonth() + 1);
            const month = String(date.getMonth() + 1).padStart(2, "0");
            setCalendarAnchorDate(`${date.getFullYear()}-${month}-01`);
          }}
          onToggleStyle={toggleStyle}
          onToggleNote={() => setNoteOpen((prev) => !prev)}
          onChangePlanningNote={setPlanningNote}
          onPressGenerate={() => void handleSmartGenerate()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#dce7ef",
  },
  mapWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  nativeMap: {
    ...StyleSheet.absoluteFillObject,
  },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#d9e7f0",
  },
  mapGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 0,
  },
  mapPin: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#1d4ed8",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  mapPinAlt: {
    backgroundColor: "#0f766e",
  },
  mapPinWarm: {
    backgroundColor: "#ea580c",
  },
  topChrome: {
    position: "absolute",
    top: 18,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chromeActions: {
    flexDirection: "row",
    gap: 8,
  },
  chromeButton: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chromeButtonPrimary: {
    backgroundColor: "rgba(17,24,39,0.88)",
  },
  chromeButtonText: {
    color: "#1f3347",
    fontSize: 13,
    fontWeight: "700",
  },
  chromeButtonPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
