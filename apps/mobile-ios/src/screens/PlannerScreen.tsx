import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { TripApiClient } from "../api/client";
import { RUNTIME_CONFIG } from "../config/runtime";
import type { ItineraryAlternative, ItineraryBlock, ItineraryLeg } from "../types/itinerary";
import type { BudgetLevel, PaceLevel, PlanDraft } from "../types/plan";
import { defaultStartDate } from "../utils/date";
import {
  blockHasCoord,
  blockTypeLabel,
  clamp,
  extractPrimaryItinerary,
  formatHourRange,
  groupDayLabel,
  toItineraryView,
} from "../utils/itinerary";

type PageMode = "input" | "result";
type DayFilter = "all" | number;
type BlockCategoryFilter = "all" | "sight" | "food" | "experience" | "night";

type PlannerDraftSeed = {
  source: "search" | "topic" | "nearby";
  destination?: string;
  keyword?: string;
  mustGo?: string[];
  travelStyles?: string[];
};

type PlannerScreenProps = {
  preloadedItinerary?: Record<string, unknown> | null;
  preloadedToken?: number;
  draftSeed?: PlannerDraftSeed | null;
  draftSeedToken?: number;
  entryPreset?: Partial<PlanDraft> | null;
  entryPresetToken?: number;
  onBackFromResult?: () => void;
  onPlanSaved?: (savedPlanId: string, itinerary: Record<string, unknown>) => void;
};

type MapPoint = {
  key: string;
  x: number;
  y: number;
  poi: string;
  blockType: string;
  timeLabel: string;
};

type MapLeg = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type GeoPoint = {
  latitude: number;
  longitude: number;
};

type NativeMapMarker = {
  key: string;
  poi: string;
  blockType: string;
  timeLabel: string;
  mapUrl: string;
  coordinate: GeoPoint;
};

type NativeMapLeg = {
  key: string;
  coordinates: GeoPoint[];
};

type NativeMapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type SaveHintTone = "success" | "info" | "error";

type MapLibraryModule = {
  default?: React.ComponentType<any>;
  Marker?: React.ComponentType<any>;
  Polyline?: React.ComponentType<any>;
};

function loadMapLibrary(): MapLibraryModule {
  try {
    return require("react-native-maps") as MapLibraryModule;
  } catch {
    return {};
  }
}

const mapLib = loadMapLibrary();
const NativeMapView = mapLib.default || null;
const NativeMarker = mapLib.Marker || null;
const NativePolyline = mapLib.Polyline || null;

const budgetOptions: Array<{ value: BudgetLevel; label: string }> = [
  { value: "low", label: "低预算" },
  { value: "medium", label: "中预算" },
  { value: "high", label: "高体验" },
];

const paceOptions: Array<{ value: PaceLevel; label: string }> = [
  { value: "relaxed", label: "轻松" },
  { value: "compact", label: "紧凑" },
];

const categoryOptions: Array<{ value: BlockCategoryFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "sight", label: "景点" },
  { value: "food", label: "餐馆" },
  { value: "experience", label: "体验" },
  { value: "night", label: "夜游" },
];

const defaultMapRegion: NativeMapRegion = {
  latitude: 31.2304,
  longitude: 121.4737,
  latitudeDelta: 0.3,
  longitudeDelta: 0.3,
};

function parseListInput(value: string): string[] {
  return value
    .split(/[\n,，、]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinListInput(values: string[]): string {
  return values.map((item) => item.trim()).filter(Boolean).join(",");
}

function parseListValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function asPositiveInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function asBudget(value: unknown): BudgetLevel | null {
  const text = String(value || "").trim().toLowerCase();
  if (text === "low" || text === "medium" || text === "high") return text;
  return null;
}

function asPace(value: unknown): PaceLevel | null {
  const text = String(value || "").trim().toLowerCase();
  if (text === "relaxed" || text === "compact") return text;
  return null;
}

function pickFirstUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0].trim() : "";
}

function extractPlaceHints(text: string): string[] {
  const cleaned = String(text || "");
  if (!cleaned.trim()) return [];

  const patterns = [
    /[\u4e00-\u9fa5A-Za-z0-9]{2,24}(?:景区|景点|公园|博物馆|古镇|老街|步行街|广场|寺|庙|塔|湖|山|岛|乐园|街区|天地|城墙|遗址|码头|动物园|植物园|美术馆|艺术馆)/g,
    /(?:去|逛|打卡|想去|推荐|安排)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9]{2,24})/g,
  ];

  const out: string[] = [];
  for (const pattern of patterns) {
    const matches = cleaned.match(pattern) || [];
    for (const item of matches) {
      const value = item.replace(/^(去|逛|打卡|想去|推荐|安排)[：:\s]*/g, "").trim();
      if (value.length >= 2) out.push(value);
    }
  }

  const link = pickFirstUrl(cleaned);
  if (link) {
    const tail = link.split(/[/?#&=_-]/g).map((item) => item.trim()).filter(Boolean);
    for (const token of tail) {
      if (/^[\u4e00-\u9fa5A-Za-z]{2,24}$/.test(token)) {
        out.push(token);
      }
    }
  }

  return Array.from(new Set(out)).slice(0, 8);
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return `¥${Math.round(value)}`;
}

function blockAccent(blockType: string): string {
  switch (blockType) {
    case "sight":
      return "#2f6ae5";
    case "food":
      return "#ef7d32";
    case "experience":
      return "#0ea58a";
    case "night":
      return "#6159d6";
    default:
      return "#4a617d";
  }
}

function riskMeta(level: string): { label: string; textColor: string; bgColor: string } {
  switch (String(level || "").toLowerCase()) {
    case "high":
      return { label: "高风险", textColor: "#a13b13", bgColor: "#ffe7da" };
    case "medium":
      return { label: "中风险", textColor: "#9a6700", bgColor: "#fff1cf" };
    default:
      return { label: "低风险", textColor: "#1d7a56", bgColor: "#ddf7ea" };
  }
}

function blockReasonLine(block: ItineraryBlock): string {
  if (block.recommendReason) return block.recommendReason;
  if (block.reasonNote) return block.reasonNote;
  if (block.title) return block.title;
  return "已按时段与动线推荐";
}

function blockDurationLabel(block: ItineraryBlock): string {
  const duration = Math.max(0.5, block.endHour - block.startHour);
  if (duration >= 1) return `约 ${duration.toFixed(duration % 1 === 0 ? 0 : 1)} 小时`;
  return "约 30 分钟";
}

function mealPeriodLabel(block: ItineraryBlock): string {
  if (block.endHour <= 10) return "早餐时段";
  if (block.startHour < 14) return "午餐时段";
  if (block.startHour < 18) return "下午茶/简餐时段";
  return "晚餐时段";
}

function mealBudgetHint(level: BudgetLevel): string {
  switch (level) {
    case "low":
      return "人均约 ¥35 - ¥80";
    case "high":
      return "人均约 ¥180 - ¥350";
    default:
      return "人均约 ¥80 - ¥180";
  }
}

function mealSuggestion(block: ItineraryBlock): string {
  if (block.weatherRisk) return "建议提前预订室内座位";
  if (block.startHour >= 18) return "晚高峰建议提前 20 分钟到店";
  return "避开整点到店更轻松";
}

function buildSuccessHint(view: ReturnType<typeof toItineraryView>): string {
  if (!view || !view.days.length) return "已生成，去地图查看";
  const firstDay = view.days[0];
  const firstBlock = firstDay.blocks[0];
  const firstFood = firstDay.blocks.find((block) => block.blockType === "food");
  const firstRisk = firstDay.blocks.find((block) => block.weatherRisk);

  const parts = ["已生成"];
  if (firstBlock?.poi) {
    parts.push(`首站 ${firstBlock.poi}（${formatHourRange(firstBlock.startHour, firstBlock.endHour)}）`);
  }
  if (firstFood?.poi) {
    parts.push(`就餐 ${formatHourRange(firstFood.startHour, firstFood.endHour)} @ ${firstFood.poi}`);
  }
  if (firstRisk?.weatherRisk) {
    parts.push(`风险：${firstRisk.weatherRisk}`);
  }
  return parts.join("；");
}

function approxZoomFromRegion(region: NativeMapRegion): number {
  const delta = Math.max(region.latitudeDelta, region.longitudeDelta);
  if (!Number.isFinite(delta) || delta <= 0) return 12;
  const zoom = Math.log2(360 / delta);
  return clamp(zoom, 4, 18.5);
}

function regionFromZoom(center: GeoPoint, zoom: number): NativeMapRegion {
  const delta = clamp(360 / Math.pow(2, zoom), 0.0025, 80);
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

function scaleRegionDelta(region: NativeMapRegion, factor: number): NativeMapRegion {
  const latDelta = clamp(region.latitudeDelta * factor, 0.0025, 80);
  const lonDelta = clamp(region.longitudeDelta * factor, 0.0025, 80);
  return {
    latitude: region.latitude,
    longitude: region.longitude,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

function isDayVisible(dayIndex: number, filter: DayFilter): boolean {
  return filter === "all" || filter === dayIndex;
}

function buildLineStyle(leg: MapLeg) {
  const dx = leg.x2 - leg.x1;
  const dy = leg.y2 - leg.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  return {
    left: leg.x1,
    top: leg.y1,
    width: length,
    transform: [{ rotate: `${angle}rad` }],
  };
}

function buildMapProjection(
  blocks: ItineraryBlock[],
  legs: ItineraryLeg[],
  width: number,
  height: number,
): { points: MapPoint[]; routes: MapLeg[] } {
  const minSize = 40;
  if (width <= minSize || height <= minSize) return { points: [], routes: [] };

  const coords: Array<{ lat: number; lon: number }> = [];
  for (const block of blocks) {
    if (blockHasCoord(block)) {
      coords.push({ lat: block.poiLat, lon: block.poiLon });
    }
  }
  for (const leg of legs) {
    coords.push({ lat: leg.fromLat, lon: leg.fromLon });
    coords.push({ lat: leg.toLat, lon: leg.toLon });
  }

  if (!coords.length) return { points: [], routes: [] };

  const lats = coords.map((item) => item.lat);
  const lons = coords.map((item) => item.lon);

  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);

  const latPad = Math.max(0.01, (maxLat - minLat) * 0.15);
  const lonPad = Math.max(0.01, (maxLon - minLon) * 0.15);

  minLat -= latPad;
  maxLat += latPad;
  minLon -= lonPad;
  maxLon += lonPad;

  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lonSpan = Math.max(0.0001, maxLon - minLon);

  const canvasPadding = 22;
  const canvasWidth = Math.max(10, width - canvasPadding * 2);
  const canvasHeight = Math.max(10, height - canvasPadding * 2);

  function project(lat: number, lon: number): { x: number; y: number } {
    const x = ((lon - minLon) / lonSpan) * canvasWidth + canvasPadding;
    const y = ((maxLat - lat) / latSpan) * canvasHeight + canvasPadding;
    return { x, y };
  }

  const points: MapPoint[] = blocks
    .filter(blockHasCoord)
    .map((block) => {
      const p = project(block.poiLat, block.poiLon);
      return {
        key: block.blockId,
        x: p.x,
        y: p.y,
        poi: block.poi,
        blockType: block.blockType,
        timeLabel: formatHourRange(block.startHour, block.endHour),
      };
    });

  const routes: MapLeg[] = legs.map((leg, idx) => {
    const from = project(leg.fromLat, leg.fromLon);
    const to = project(leg.toLat, leg.toLon);
    return {
      key: `route-${leg.dayIndex}-${idx}`,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    };
  });

  return { points, routes };
}

function buildNativeMapData(blocks: ItineraryBlock[], legs: ItineraryLeg[]): { markers: NativeMapMarker[]; routes: NativeMapLeg[] } {
  const markers = blocks
    .filter(blockHasCoord)
    .map((block) => ({
      key: block.blockId,
      poi: block.poi,
      blockType: block.blockType,
      timeLabel: formatHourRange(block.startHour, block.endHour),
      mapUrl: block.mapUrl,
      coordinate: {
        latitude: block.poiLat,
        longitude: block.poiLon,
      },
    }));

  const routes = legs.map((leg, idx) => ({
    key: `native-route-${leg.dayIndex}-${idx}`,
    coordinates: [
      { latitude: leg.fromLat, longitude: leg.fromLon },
      { latitude: leg.toLat, longitude: leg.toLon },
    ],
  }));

  return { markers, routes };
}

function buildNativeMapRegion(markers: NativeMapMarker[], routes: NativeMapLeg[]): NativeMapRegion | null {
  const coords: GeoPoint[] = [];
  for (const marker of markers) {
    coords.push(marker.coordinate);
  }
  for (const route of routes) {
    for (const point of route.coordinates) {
      coords.push(point);
    }
  }
  if (!coords.length) return null;

  const lats = coords.map((item) => item.latitude);
  const lons = coords.map((item) => item.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const latSpan = Math.max(0.012, maxLat - minLat);
  const lonSpan = Math.max(0.012, maxLon - minLon);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latSpan * 1.45,
    longitudeDelta: lonSpan * 1.45,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value: unknown): string {
  const seen = new WeakSet<object>();

  function normalize(input: unknown): unknown {
    if (input === null || typeof input !== "object") return input;
    if (Array.isArray(input)) return input.map((item) => normalize(item));

    const record = input as Record<string, unknown>;
    if (seen.has(record)) return null;
    seen.add(record);

    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = normalize(record[key]);
    }
    return out;
  }

  try {
    return JSON.stringify(normalize(value)) || "";
  } catch {
    return "";
  }
}

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function PlannerScreen({
  preloadedItinerary = null,
  preloadedToken = 0,
  draftSeed = null,
  draftSeedToken = 0,
  entryPreset = null,
  entryPresetToken = 0,
  onBackFromResult,
  onPlanSaved,
}: PlannerScreenProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const abVariant = useMemo(() => (stableHash(RUNTIME_CONFIG.userId) % 2 === 0 ? "control" : "today"), []);
  const heroTitle = abVariant === "today" ? "今天就能出发的地图行程" : "AI 旅行规划";

  const [mode, setMode] = useState<PageMode>("input");

  const [originCity, setOriginCity] = useState("上海");
  const [destination, setDestination] = useState("杭州");
  const [daysText, setDaysText] = useState("3");
  const [startDate, setStartDate] = useState(defaultStartDate(15));
  const [budget, setBudget] = useState<BudgetLevel>("medium");
  const [pace, setPace] = useState<PaceLevel>("relaxed");
  const [companionsText, setCompanionsText] = useState("朋友");
  const [stylesText, setStylesText] = useState("citywalk,美食");
  const [mustGoText, setMustGoText] = useState("");
  const [avoidText, setAvoidText] = useState("");
  const [importText, setImportText] = useState("");

  const [status, setStatus] = useState("填写信息后点击生成");
  const [itinerary, setItinerary] = useState<Record<string, unknown> | null>(null);
  const [savedPlanId, setSavedPlanId] = useState("");
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState("");
  const [saveHint, setSaveHint] = useState<{ text: string; tone: SaveHintTone } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayFilter>("all");
  const [selectedCategory, setSelectedCategory] = useState<BlockCategoryFilter>("all");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [didHydratePref, setDidHydratePref] = useState(false);

  const itineraryView = useMemo(() => toItineraryView(itinerary), [itinerary]);
  const itineraryFingerprint = useMemo(() => stableSerialize(itinerary), [itinerary]);
  const isCurrentVersionSaved = Boolean(savedPlanId) && itineraryFingerprint !== "" && itineraryFingerprint === lastSavedFingerprint;
  const saveButtonLabel = isSaving ? "保存中..." : isCurrentVersionSaved ? "已保存" : "保存行程";

  function handleBack() {
    if (onBackFromResult) {
      onBackFromResult();
      return;
    }
    setMode("input");
  }

  const visibleDays = useMemo(() => {
    if (!itineraryView) return [];
    return itineraryView.days.filter((day) => isDayVisible(day.dayIndex, selectedDay));
  }, [itineraryView, selectedDay]);

  const dayScopedBlocks = useMemo(() => visibleDays.flatMap((day) => day.blocks), [visibleDays]);
  const visibleBlocks = useMemo(() => {
    if (selectedCategory === "all") return dayScopedBlocks;
    return dayScopedBlocks.filter((block) => block.blockType === selectedCategory);
  }, [dayScopedBlocks, selectedCategory]);

  const visibleLegs = useMemo(() => {
    if (!itineraryView) return [];
    return itineraryView.legs.filter((leg) => isDayVisible(leg.dayIndex, selectedDay));
  }, [itineraryView, selectedDay]);

  const mapProjection = useMemo(
    () => buildMapProjection(visibleBlocks, visibleLegs, mapSize.width, mapSize.height),
    [visibleBlocks, visibleLegs, mapSize.height, mapSize.width],
  );
  const nativeMapData = useMemo(() => buildNativeMapData(visibleBlocks, visibleLegs), [visibleBlocks, visibleLegs]);
  const nativeMapRegion = useMemo(
    () => buildNativeMapRegion(nativeMapData.markers, nativeMapData.routes),
    [nativeMapData.markers, nativeMapData.routes],
  );
  const mapRef = useRef<any>(null);
  const mapZoomRef = useRef(12.8);
  const mapRegionRef = useRef<NativeMapRegion>(nativeMapRegion || defaultMapRegion);

  const blockById = useMemo(() => {
    const map = new Map<string, ItineraryBlock>();
    for (const block of visibleBlocks) {
      map.set(block.blockId, block);
    }
    return map;
  }, [visibleBlocks]);

  const selectedBlock = useMemo(() => {
    if (!visibleBlocks.length) return null;
    if (selectedBlockId) {
      return blockById.get(selectedBlockId) || visibleBlocks[0];
    }
    return visibleBlocks[0];
  }, [blockById, selectedBlockId, visibleBlocks]);

  const selectedPoint = useMemo(() => {
    if (!mapProjection.points.length) return null;
    if (selectedBlock) {
      const found = mapProjection.points.find((point) => point.key === selectedBlock.blockId);
      if (found) return found;
    }
    return mapProjection.points[0];
  }, [mapProjection.points, selectedBlock]);

  const selectedNativeMarker = useMemo(() => {
    if (!nativeMapData.markers.length) return null;
    if (!selectedBlock) return nativeMapData.markers[0];
    return nativeMapData.markers.find((item) => item.key === selectedBlock.blockId) || nativeMapData.markers[0];
  }, [nativeMapData.markers, selectedBlock]);

  const selectedRisk = useMemo(
    () => riskMeta(selectedBlock?.riskLevel || "low"),
    [selectedBlock?.riskLevel],
  );

  const foodHighlights = useMemo(
    () => dayScopedBlocks.filter((block) => block.blockType === "food"),
    [dayScopedBlocks],
  );
  const dayBlocksByCategory = useMemo(() => {
    const out = new Map<number, ItineraryBlock[]>();
    for (const day of visibleDays) {
      out.set(
        day.dayIndex,
        selectedCategory === "all" ? day.blocks : day.blocks.filter((block) => block.blockType === selectedCategory),
      );
    }
    return out;
  }, [selectedCategory, visibleDays]);

  useEffect(() => {
    if (!visibleBlocks.length) {
      if (selectedBlockId) setSelectedBlockId("");
      return;
    }
    if (!selectedBlockId || !blockById.has(selectedBlockId)) {
      setSelectedBlockId(visibleBlocks[0].blockId);
    }
  }, [blockById, selectedBlockId, visibleBlocks]);

  useEffect(() => {
    if (!saveHint) return;
    const timer = setTimeout(() => {
      setSaveHint(null);
    }, 2200);
    return () => clearTimeout(timer);
  }, [saveHint]);

  useEffect(() => {
    if (!NativeMapView || !nativeMapRegion || !mapRef.current?.animateToRegion) return;
    mapRef.current.animateToRegion(nativeMapRegion, 280);
    mapZoomRef.current = approxZoomFromRegion(nativeMapRegion);
    mapRegionRef.current = nativeMapRegion;
  }, [
    nativeMapRegion?.latitude,
    nativeMapRegion?.longitude,
    nativeMapRegion?.latitudeDelta,
    nativeMapRegion?.longitudeDelta,
  ]);

  useEffect(() => {
    if (!NativeMapView || !selectedNativeMarker || !mapRef.current) return;
    const nextZoom = clamp(mapZoomRef.current, 6, 18.5);
    const nextCenter = selectedNativeMarker.coordinate;
    const mapInst = mapRef.current as any;

    if (Platform.OS !== "ios" && typeof mapInst.animateCamera === "function") {
      mapInst.animateCamera(
        {
          center: nextCenter,
          zoom: nextZoom,
        },
        { duration: 260 },
      );
      return;
    }

    if (typeof mapInst.animateToRegion === "function") {
      const nextRegion = regionFromZoom(nextCenter, nextZoom);
      mapRegionRef.current = nextRegion;
      mapZoomRef.current = approxZoomFromRegion(nextRegion);
      mapInst.animateToRegion(nextRegion, 260);
    }
  }, [selectedNativeMarker?.key]);

  useEffect(() => {
    void api.trackEvent("mobile_entry_copy_exposed", { variant: abVariant }).catch(() => undefined);
  }, [abVariant, api]);

  useEffect(() => {
    if (!preloadedToken || !preloadedItinerary) return;
    setItinerary(preloadedItinerary);
    setMode("result");
    setSelectedDay("all");
    setSelectedCategory("all");
    setSelectedBlockId("");
    setSavedPlanId("");
    setLastSavedFingerprint("");
    setSaveHint(null);
    setStatus("已载入行程，可继续调整");
  }, [preloadedItinerary, preloadedToken]);

  useEffect(() => {
    if (!draftSeedToken || !draftSeed) return;
    const incomingDestination = String(draftSeed.destination || "").trim();
    const incomingKeyword = String(draftSeed.keyword || "").trim();
    const incomingMustGo = (draftSeed.mustGo || []).map((item) => String(item || "").trim()).filter(Boolean);
    const incomingStyles = (draftSeed.travelStyles || []).map((item) => String(item || "").trim()).filter(Boolean);

    if (incomingDestination) {
      setDestination(incomingDestination);
    }

    if (incomingStyles.length) {
      setStylesText((prev) => joinListInput(Array.from(new Set([...parseListInput(prev), ...incomingStyles]))));
    }

    if (incomingMustGo.length || incomingKeyword) {
      setMustGoText((prev) =>
        joinListInput(Array.from(new Set([...parseListInput(prev), ...incomingMustGo, incomingKeyword])).filter(Boolean)),
      );
    }

    setMode("input");
    setStatus("已加入草案，可直接生成");
    void api
      .trackEvent("mobile_discover_draft_applied", {
        source: draftSeed.source,
        has_destination: Boolean(incomingDestination),
        must_go_count: incomingMustGo.length,
        styles_count: incomingStyles.length,
      })
      .catch(() => undefined);
  }, [api, draftSeed, draftSeedToken]);

  useEffect(() => {
    if (!entryPresetToken || !entryPreset) return;

    const nextOrigin = String(entryPreset.origin_city || "").trim();
    const nextDestination = String(entryPreset.destination || "").trim();
    const nextStartDate = String(entryPreset.start_date || "").trim();
    const nextDays = asPositiveInt(entryPreset.days);
    const nextCompanions = parseListValue(entryPreset.companions);
    const nextStyles = parseListValue(entryPreset.travel_styles);
    const nextMustGo = parseListValue(entryPreset.must_go);
    const nextAvoid = parseListValue(entryPreset.avoid);

    if (nextOrigin) setOriginCity(nextOrigin);
    if (nextDestination) setDestination(nextDestination);
    if (nextStartDate) setStartDate(nextStartDate);
    if (nextDays) setDaysText(String(Math.max(1, Math.min(nextDays, 14))));
    if (entryPreset.budget_level) setBudget(entryPreset.budget_level);
    if (entryPreset.pace) setPace(entryPreset.pace);
    if (nextCompanions.length) setCompanionsText(joinListInput(nextCompanions));
    if (nextStyles.length) setStylesText(joinListInput(nextStyles));
    if (nextMustGo.length) setMustGoText(joinListInput(nextMustGo));
    if (nextAvoid.length) setAvoidText(joinListInput(nextAvoid));

    setMode("input");
    setStatus("已带入当前草案，可继续细化");
  }, [entryPreset, entryPresetToken]);

  useEffect(() => {
    if (didHydratePref || mode !== "input") return;
    let cancelled = false;

    async function hydratePreferences() {
      try {
        const list = await api.listSavedPlans(1);
        if (cancelled || !list.length) {
          setDidHydratePref(true);
          return;
        }

        const detail = await api.getSavedPlan(list[0].id);
        if (cancelled || !isRecord(detail.itinerary)) {
          setDidHydratePref(true);
          return;
        }

        const snapshotRaw = detail.itinerary["request_snapshot"];
        const snapshot = isRecord(snapshotRaw) ? snapshotRaw : {};

        const savedOrigin = String(snapshot.origin_city || "").trim();
        const savedDestination = String(snapshot.destination || "").trim();
        const savedStartDate = String(snapshot.start_date || "").trim();
        const savedDays = asPositiveInt(snapshot.days);
        const savedBudget = asBudget(snapshot.budget_level);
        const savedPace = asPace(snapshot.pace);
        const savedCompanions = parseListValue(snapshot.companions);
        const savedStyles = parseListValue(snapshot.travel_styles);
        const savedMustGo = parseListValue(snapshot.must_go);
        const savedAvoid = parseListValue(snapshot.avoid);

        if (savedOrigin) setOriginCity(savedOrigin);
        if (savedDestination) setDestination(savedDestination);
        if (savedStartDate) setStartDate(savedStartDate);
        if (savedDays) setDaysText(String(Math.max(1, Math.min(savedDays, 14))));
        if (savedBudget) setBudget(savedBudget);
        if (savedPace) setPace(savedPace);
        if (savedCompanions.length) setCompanionsText(joinListInput(savedCompanions));
        if (savedStyles.length) setStylesText(joinListInput(savedStyles));
        if (savedMustGo.length) setMustGoText(joinListInput(savedMustGo));
        if (savedAvoid.length) setAvoidText(joinListInput(savedAvoid));
        setStatus("已带入最近偏好");
      } catch {
        // Ignore hydration failures to avoid blocking plan generation.
      } finally {
        if (!cancelled) setDidHydratePref(true);
      }
    }

    void hydratePreferences();
    return () => {
      cancelled = true;
    };
  }, [api, didHydratePref, mode]);

  const loading = isGenerating || isSaving || isOptimizing || isExtracting || isAskingAI;

  const { height: screenHeight } = useWindowDimensions();
  const peekHeight = 160;
  const expandedHeight = Math.max(360, Math.min(screenHeight * 0.78, screenHeight - 80));
  const collapsedTop = Math.max(120, screenHeight - peekHeight);
  const expandedTop = Math.max(70, screenHeight - expandedHeight);
  const sheetRange = Math.max(0, collapsedTop - expandedTop);

  const sheetOffset = useRef(new Animated.Value(sheetRange)).current;
  const sheetOffsetRef = useRef(sheetRange);
  const gestureStartOffsetRef = useRef(sheetRange);

  useEffect(() => {
    const id = sheetOffset.addListener(({ value }) => {
      sheetOffsetRef.current = value;
    });
    return () => {
      sheetOffset.removeListener(id);
    };
  }, [sheetOffset]);

  useEffect(() => {
    const target = mode === "result" ? sheetRange : screenHeight;
    sheetOffset.setValue(target);
    sheetOffsetRef.current = target;
  }, [mode, screenHeight, sheetOffset, sheetRange]);

  function animateSheet(toValue: number) {
    Animated.spring(sheetOffset, {
      toValue,
      useNativeDriver: true,
      speed: 22,
      bounciness: 4,
    }).start(() => {
      sheetOffsetRef.current = toValue;
    });
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          gestureStartOffsetRef.current = sheetOffsetRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const nextOffset = clamp(gestureStartOffsetRef.current + gesture.dy, 0, sheetRange);
          sheetOffset.setValue(nextOffset);
        },
        onPanResponderRelease: (_, gesture) => {
          const current = clamp(gestureStartOffsetRef.current + gesture.dy, 0, sheetRange);
          const midpoint = sheetRange / 2;

          if (gesture.vy > 0.45) {
            animateSheet(sheetRange);
            return;
          }
          if (gesture.vy < -0.45) {
            animateSheet(0);
            return;
          }

          animateSheet(current > midpoint ? sheetRange : 0);
        },
      }),
    [sheetOffset, sheetRange],
  );

  async function trackUIEvent(eventName: string, metadata: Record<string, unknown> = {}) {
    try {
      await api.trackEvent(eventName, metadata);
    } catch {
      // Swallow tracking errors to avoid affecting user flow.
    }
  }

  function onSelectBlock(blockId: string, source: string) {
    if (selectedCategory !== "all" && !blockById.has(blockId)) {
      setSelectedCategory("all");
    }
    setSelectedBlockId(blockId);
    const block = blockById.get(blockId);
    void trackUIEvent("mobile_marker_clicked", {
      source,
      block_id: blockId,
      day_filter: selectedDay,
      category_filter: selectedCategory,
      block_type: block?.blockType || "",
      poi: block?.poi || "",
    });
    if (block?.blockType === "food") {
      void trackUIEvent("mobile_restaurant_clicked", {
        source,
        block_id: blockId,
        day_filter: selectedDay,
        category_filter: selectedCategory,
        poi: block?.poi || "",
      });
    }
  }

  function onChangeDayFilter(next: DayFilter) {
    setSelectedDay(next);
    void trackUIEvent("mobile_day_filter_changed", {
      day_filter: next,
      category_filter: selectedCategory,
    });
  }

  function onChangeCategoryFilter(next: BlockCategoryFilter) {
    setSelectedCategory(next);
    void trackUIEvent("mobile_category_filter_changed", {
      category_filter: next,
      day_filter: selectedDay,
    });
  }

  async function onExtractFromText() {
    const text = importText.trim();
    if (!text) {
      setStatus("先粘贴文本或链接");
      return;
    }

    setIsExtracting(true);
    setStatus("提取中...");
    try {
      const draftForParse = {
        origin_city: originCity.trim(),
        destination: destination.trim(),
        days: Number(daysText),
        budget_level: budget,
        pace,
        start_date: startDate.trim(),
        companions: parseListInput(companionsText),
        travel_styles: parseListInput(stylesText),
        must_go: parseListInput(mustGoText),
        avoid: parseListInput(avoidText),
      };

      const intake = await api.chatIntakeNext([{ role: "user", message: text }], draftForParse);
      const updatedDraft = isRecord(intake.updated_draft) ? intake.updated_draft : {};

      const parsedOrigin = String(updatedDraft.origin_city || "").trim();
      const parsedDestination = String(updatedDraft.destination || "").trim();
      const parsedStartDate = String(updatedDraft.start_date || "").trim();
      const parsedDays = asPositiveInt(updatedDraft.days);
      const parsedBudget = asBudget(updatedDraft.budget_level);
      const parsedPace = asPace(updatedDraft.pace);
      const parsedCompanions = parseListValue(updatedDraft.companions);
      const parsedStyles = parseListValue(updatedDraft.travel_styles);
      const parsedMustGo = parseListValue(updatedDraft.must_go);
      const parsedAvoid = parseListValue(updatedDraft.avoid);
      const inferredPlaceHints = extractPlaceHints(text);

      if (parsedOrigin) setOriginCity(parsedOrigin);
      if (parsedDestination) setDestination(parsedDestination);
      if (parsedStartDate) setStartDate(parsedStartDate);
      if (parsedDays) setDaysText(String(Math.max(1, Math.min(14, parsedDays))));
      if (parsedBudget) setBudget(parsedBudget);
      if (parsedPace) setPace(parsedPace);
      if (parsedCompanions.length) setCompanionsText(joinListInput(parsedCompanions));
      if (parsedStyles.length) setStylesText(joinListInput(parsedStyles));
      if (parsedAvoid.length) setAvoidText(joinListInput(parsedAvoid));

      const mergedMustGo = Array.from(new Set([...parsedMustGo, ...parseListInput(mustGoText), ...inferredPlaceHints]));
      if (mergedMustGo.length) setMustGoText(joinListInput(mergedMustGo));

      const assistantMessage = String(intake.assistant_message || "").trim();
      setStatus(assistantMessage || "已提取，可直接生成");
      void trackUIEvent("mobile_import_extracted", {
        has_url: Boolean(pickFirstUrl(text)),
        inferred_must_go_count: inferredPlaceHints.length,
        ready_to_generate: Boolean(intake.ready_to_generate),
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsExtracting(false);
    }
  }

  async function onOptimizeToday() {
    if (!itinerary || !itineraryView) {
      setStatus("先生成行程");
      return;
    }

    const dayIndex = selectedDay === "all" ? 0 : selectedDay;
    const fallbackTarget = itineraryView.days.find((item) => item.dayIndex === dayIndex) || itineraryView.days[0];
    const firstBlock = fallbackTarget?.blocks[0] || null;
    const startHour = Math.max(8, Math.floor((selectedBlock || firstBlock)?.startHour || 11));
    const endHour = Math.min(22, Math.max(startHour + 2, Math.ceil((selectedBlock || firstBlock)?.endHour || 18)));

    setIsOptimizing(true);
    setStatus(`优化中 · DAY ${dayIndex + 1}`);
    try {
      const patch: Record<string, unknown> = {
        change_type: "replan_window",
        keep_locked: true,
        affected_days: [dayIndex],
        targets: [
          {
            day_index: dayIndex,
            start_hour: startHour,
            end_hour: endHour,
          },
        ],
      };
      const next = await api.replanPlan(itinerary, patch);
      setItinerary(next);
      setSelectedBlockId("");
      setSelectedCategory("all");
      setSavedPlanId("");
      setLastSavedFingerprint("");
      setStatus(`已优化 DAY ${dayIndex + 1}（${startHour}:00-${endHour}:00）`);
      void trackUIEvent("mobile_optimize_today_clicked", {
        day_index: dayIndex,
        start_hour: startHour,
        end_hour: endHour,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOptimizing(false);
    }
  }

  async function onAskAI() {
    if (!selectedBlock) {
      setStatus("先选一个地点");
      return;
    }

    setIsAskingAI(true);
    setStatus("AI 分析中...");
    try {
      const question = `我在 ${destination} 的行程里选中了 ${selectedBlock.poi}（${formatHourRange(
        selectedBlock.startHour,
        selectedBlock.endHour,
      )}），请给出是否保留、何时去更合适、以及一个替代建议。`;
      const intake = await api.chatIntakeNext([{ role: "user", message: question }], {
        destination: destination.trim(),
        budget_level: budget,
        pace,
        start_date: startDate.trim(),
      });
      const reply = String(intake.assistant_message || "").trim();
      setStatus(reply || "建议已更新");
      void trackUIEvent("mobile_ask_ai_clicked", {
        block_id: selectedBlock.blockId,
        poi: selectedBlock.poi,
        block_type: selectedBlock.blockType,
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsAskingAI(false);
    }
  }

  function onAddToDraftMustGo() {
    if (!selectedBlock?.poi) {
      setStatus("该地点不可加入");
      return;
    }
    const merged = Array.from(new Set([...parseListInput(mustGoText), selectedBlock.poi]));
    setMustGoText(joinListInput(merged));
    setStatus(`已加入必去：${selectedBlock.poi}`);
    void trackUIEvent("mobile_add_to_draft_clicked", {
      block_id: selectedBlock.blockId,
      poi: selectedBlock.poi,
      must_go_count: merged.length,
    });
  }

  async function onGeneratePlan() {
    const days = Number(daysText);
    if (!Number.isInteger(days) || days < 1 || days > 14) {
      setStatus("天数需在 1-14");
      return;
    }
    if (!destination.trim()) {
      setStatus("请输入目的地");
      return;
    }
    if (!startDate.trim()) {
      setStatus("请输入日期 YYYY-MM-DD");
      return;
    }

    const draft: PlanDraft = {
      origin_city: originCity.trim(),
      destination: destination.trim(),
      days,
      budget_level: budget,
      companions: parseListInput(companionsText),
      travel_styles: parseListInput(stylesText),
      must_go: parseListInput(mustGoText),
      avoid: parseListInput(avoidText),
      start_date: startDate.trim(),
      pace,
    };

    setIsGenerating(true);
    setSavedPlanId("");
    setLastSavedFingerprint("");
    setSaveHint(null);
    setStatus("生成中...");
    void trackUIEvent("mobile_generate_clicked", {
      destination: draft.destination,
      days: draft.days,
      budget_level: draft.budget_level,
      pace: draft.pace,
      styles_count: draft.travel_styles.length,
      must_go_count: draft.must_go.length,
      ab_variant: abVariant,
    });

    try {
      const result = await api.generatePlan(draft);
      const primary = extractPrimaryItinerary(result);
      const nextView = toItineraryView(primary);
      setItinerary(primary);
      setSelectedDay("all");
      setSelectedCategory("all");
      setSelectedBlockId("");
      setMode("result");
      setStatus(buildSuccessHint(nextView));
      animateSheet(sheetRange);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGenerating(false);
    }
  }

  async function onSavePlan() {
    if (!itinerary) {
      setStatus("先生成再保存");
      return;
    }

    if (isCurrentVersionSaved) {
      setStatus("已保存");
      setSaveHint({ text: "已保存", tone: "info" });
      void trackUIEvent("mobile_save_deduped", {
        saved_plan_id: savedPlanId,
        day_filter: selectedDay,
        category_filter: selectedCategory,
      });
      return;
    }

    setIsSaving(true);
    setStatus("保存中");
    setSaveHint({ text: "保存中", tone: "info" });
    void trackUIEvent("mobile_save_clicked", {
      has_itinerary: Boolean(itinerary),
      day_filter: selectedDay,
      category_filter: selectedCategory,
    });
    try {
      const result = await api.savePlan(itinerary);
      const id = String(result.saved_plan_id || result.id || "");
      setSavedPlanId(id);
      setLastSavedFingerprint(itineraryFingerprint);
      if (result.deduped) {
        setStatus("已保存");
        setSaveHint({ text: "已保存", tone: "info" });
      } else {
        setStatus("已保存");
        setSaveHint({ text: "已保存", tone: "success" });
      }
      if (id) {
        onPlanSaved?.(id, itinerary);
        void trackUIEvent("mobile_save_succeeded", {
          saved_plan_id: id,
          deduped: Boolean(result.deduped),
        });
      }
    } catch (error) {
      setSaveHint({ text: "保存失败", tone: "error" });
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function onOpenMap() {
    if (!selectedBlock?.mapUrl) {
      setStatus("该地点暂无导航链接");
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(selectedBlock.mapUrl);
      if (!canOpen) {
        setStatus("当前设备无法打开导航");
        return;
      }
      await Linking.openURL(selectedBlock.mapUrl);
      void trackUIEvent("mobile_nav_clicked", {
        block_id: selectedBlock.blockId,
        poi: selectedBlock.poi,
        block_type: selectedBlock.blockType,
      });
    } catch {
      setStatus("打开导航失败");
    }
  }

  function onZoom(step: number) {
    if (!NativeMapView || !mapRef.current) {
      setStatus("简版地图暂不支持缩放");
      return;
    }

    const mapInst = mapRef.current as any;
    const baseRegion = mapRegionRef.current || nativeMapRegion || defaultMapRegion;
    const factor = step > 0 ? 0.72 : 1 / 0.72;
    const nextRegion = scaleRegionDelta(baseRegion, factor);
    mapRegionRef.current = nextRegion;
    mapZoomRef.current = approxZoomFromRegion(nextRegion);

    // iOS 模拟器上 zoom camera 常出现无效，优先用 region delta 保证可见缩放。
    if (Platform.OS === "ios" && typeof mapInst.animateToRegion === "function") {
      mapInst.animateToRegion(nextRegion, 220);
      return;
    }

    if (typeof mapInst.animateCamera === "function") {
      const center = {
        latitude: nextRegion.latitude,
        longitude: nextRegion.longitude,
      };
      mapInst.animateCamera(
        {
          center,
          zoom: clamp(mapZoomRef.current + step, 6, 19),
        },
        { duration: 220 },
      );
      return;
    }

    if (typeof mapInst.animateToRegion === "function") {
      mapInst.animateToRegion(nextRegion, 220);
      return;
    }

    setStatus("当前地图不支持缩放");
  }

  function onPickAlternative(block: ItineraryBlock, alternative: ItineraryAlternative) {
    if (!itinerary) {
      setStatus("先生成行程再替换");
      return;
    }

    setItinerary((prev) => {
      if (!prev) return prev;

      let next: Record<string, unknown>;
      try {
        next = JSON.parse(JSON.stringify(prev)) as Record<string, unknown>;
      } catch {
        return prev;
      }

      const dayItems = Array.isArray(next.days) ? next.days : [];
      for (const dayItem of dayItems) {
        if (!isRecord(dayItem)) continue;
        const blockItems = Array.isArray(dayItem.blocks) ? dayItem.blocks : [];
        for (const blockItem of blockItems) {
          if (!isRecord(blockItem)) continue;
          if (String(blockItem.block_id || "") !== block.blockId) continue;

          blockItem.poi = alternative.poi;
          blockItem.poi_lat = alternative.poiLat;
          blockItem.poi_lon = alternative.poiLon;
          if (alternative.mapUrl) {
            blockItem.poi_map_url = alternative.mapUrl;
          }

          const reasonText = alternative.note
            ? `已切换备选：${alternative.note}`
            : `已切换为备选地点 ${alternative.poi}`;
          blockItem.recommend_reason = reasonText;
          blockItem.risk_level = "medium";

          const reason = isRecord(blockItem.reason) ? blockItem.reason : {};
          reason.note = reasonText;
          blockItem.reason = reason;
          break;
        }
      }

      return next;
    });

    setStatus(`已切换：${alternative.poi}`);
    setSavedPlanId("");
    setLastSavedFingerprint("");
    void trackUIEvent("mobile_alternative_picked", {
      block_id: block.blockId,
      old_poi: block.poi,
      new_poi: alternative.poi,
      block_type: block.blockType,
    });
  }

  if (mode === "input") {
    return (
      <ScrollView style={styles.inputScreen} contentContainerStyle={styles.inputContent}>
        {onBackFromResult ? (
          <View style={styles.inputTopBar}>
            <Pressable style={styles.topButton} onPress={handleBack}>
              <Text style={styles.topButtonText}>返回</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.heroCard}>
          <Text style={styles.heroTag}>AI 行程</Text>
          <Text style={styles.heroTitle}>{heroTitle}</Text>
          <Text style={styles.heroSubtitle}>输入偏好，生成可执行路线。</Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.formTitle}>行程信息</Text>

          <View style={styles.rowInputs}>
            <TextInput style={[styles.input, styles.halfInput]} value={originCity} onChangeText={setOriginCity} placeholder="出发城市" />
            <TextInput style={[styles.input, styles.halfInput]} value={destination} onChangeText={setDestination} placeholder="目的地" />
          </View>

          <View style={styles.rowInputs}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              value={daysText}
              onChangeText={setDaysText}
              keyboardType="number-pad"
              placeholder="天数 1-14"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              value={startDate}
              onChangeText={setStartDate}
              autoCapitalize="none"
              placeholder="YYYY-MM-DD"
            />
          </View>

          <Text style={styles.label}>预算偏好</Text>
          <View style={styles.optionRow}>
            {budgetOptions.map((item) => (
              <Pressable
                key={item.value}
                style={[styles.choiceChip, budget === item.value ? styles.choiceChipActive : null]}
                onPress={() => setBudget(item.value)}
              >
                <Text style={[styles.choiceText, budget === item.value ? styles.choiceTextActive : null]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>行程节奏</Text>
          <View style={styles.optionRow}>
            {paceOptions.map((item) => (
              <Pressable
                key={item.value}
                style={[styles.choiceChip, pace === item.value ? styles.choiceChipActive : null]}
                onPress={() => setPace(item.value)}
              >
                <Text style={[styles.choiceText, pace === item.value ? styles.choiceTextActive : null]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={companionsText}
            onChangeText={setCompanionsText}
            placeholder="同伴（如 朋友,父母）"
            multiline
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={stylesText}
            onChangeText={setStylesText}
            placeholder="偏好（如 citywalk,美食）"
            multiline
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={mustGoText}
            onChangeText={setMustGoText}
            placeholder="必去（逗号分隔）"
            multiline
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={avoidText}
            onChangeText={setAvoidText}
            placeholder="避雷（逗号分隔）"
            multiline
          />

          <TextInput
            style={[styles.input, styles.multilineInput, styles.importInput]}
            value={importText}
            onChangeText={setImportText}
            placeholder="粘贴攻略文本/链接，自动提取信息"
            multiline
          />

          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryAction} onPress={() => void onExtractFromText()} disabled={loading}>
              <Text style={styles.secondaryActionText}>{isExtracting ? "提取中..." : "智能提取"}</Text>
            </Pressable>
          </View>

          <Pressable style={styles.primaryButton} onPress={() => void onGeneratePlan()} disabled={loading}>
            <Text style={styles.primaryButtonText}>生成行程</Text>
          </Pressable>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>状态</Text>
            {loading ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
          </View>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.mapScreen}>
      <View
        style={styles.mapCanvas}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setMapSize((prev) =>
            Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1 ? { width, height } : prev,
          );
        }}
      >
        {NativeMapView && NativeMarker && NativePolyline ? (
          <NativeMapView
            ref={mapRef}
            style={styles.nativeMap}
            initialRegion={nativeMapRegion || defaultMapRegion}
            zoomEnabled
            scrollEnabled
            showsCompass={false}
            showsScale={false}
            toolbarEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            loadingEnabled
            moveOnMarkerPress={false}
            onRegionChangeComplete={(region: NativeMapRegion) => {
              mapRegionRef.current = region;
              mapZoomRef.current = approxZoomFromRegion(region);
            }}
          >
            {nativeMapData.routes.map((route) => (
              <NativePolyline
                key={route.key}
                coordinates={route.coordinates}
                strokeColor="rgba(42,102,223,0.66)"
                strokeWidth={4}
              />
            ))}

            {nativeMapData.markers.map((item) => (
              <NativeMarker
                key={item.key}
                coordinate={item.coordinate}
                title={item.poi || "待确认地点"}
                description={item.timeLabel}
                pinColor={blockAccent(item.blockType)}
                onPress={() => onSelectBlock(item.key, "native_map_marker")}
              />
            ))}
          </NativeMapView>
        ) : (
          <>
            <View style={styles.mapGridLineHorizontal} />
            <View style={styles.mapGridLineVertical} />

            {mapProjection.routes.map((route) => (
              <View key={route.key} style={[styles.routeLine, buildLineStyle(route)]} />
            ))}

            {mapProjection.points.map((point) => (
              <Pressable
                key={point.key}
                style={[styles.markerWrap, { left: point.x - 10, top: point.y - 10 }]}
                onPress={() => onSelectBlock(point.key, "fallback_map_marker")}
              >
                <View
                  style={[
                    styles.markerDot,
                    { backgroundColor: blockAccent(point.blockType) },
                    point.key === selectedBlock?.blockId ? styles.markerDotActive : null,
                  ]}
                />
              </Pressable>
            ))}

            {selectedPoint ? (
              <View style={[styles.markerLabelWrap, { left: selectedPoint.x + 12, top: selectedPoint.y - 15 }]}>
                <Text numberOfLines={1} style={styles.markerLabelText}>
                  {selectedPoint.timeLabel}
                </Text>
                <Text numberOfLines={1} style={styles.markerLabelPoi}>
                  {selectedPoint.poi}
                </Text>
              </View>
            ) : null}

            <View style={styles.mapFallbackPill}>
              <Text style={styles.mapFallbackText}>地图 SDK 未安装，当前为简版地图</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.zoomButtonsWrap}>
        <Pressable style={styles.zoomButton} hitSlop={10} onPress={() => onZoom(0.8)}>
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <Pressable style={styles.zoomButton} hitSlop={10} onPress={() => onZoom(-0.8)}>
          <Text style={styles.zoomButtonText}>-</Text>
        </Pressable>
      </View>

      <View style={styles.mapTopBar}>
        <Pressable style={styles.topButton} onPress={handleBack}>
          <Text style={styles.topButtonText}>返回</Text>
        </Pressable>
        <Pressable
          style={[
            styles.topButtonPrimary,
            loading || !itinerary || isCurrentVersionSaved ? styles.topButtonPrimaryDisabled : null,
          ]}
          onPress={() => void onSavePlan()}
          disabled={loading || !itinerary || isCurrentVersionSaved}
        >
          <Text style={styles.topButtonPrimaryText}>{saveButtonLabel}</Text>
        </Pressable>
      </View>

      {saveHint ? (
        <View
          style={[
            styles.saveHintPill,
            saveHint.tone === "success" ? styles.saveHintSuccess : null,
            saveHint.tone === "error" ? styles.saveHintError : null,
            saveHint.tone === "info" ? styles.saveHintInfo : null,
          ]}
        >
          <Text style={styles.saveHintText}>{saveHint.text}</Text>
        </View>
      ) : null}

      <View style={styles.mapInfoCard}>
        <View style={styles.mapInfoHeader}>
          <View style={styles.mapInfoHeaderLeft}>
            <Text style={styles.mapInfoTag}>
              {selectedBlock
                ? `${blockTypeLabel(selectedBlock.blockType)} · ${formatHourRange(selectedBlock.startHour, selectedBlock.endHour)}`
                : "地点"}
            </Text>
            <View style={[styles.riskBadge, { backgroundColor: selectedRisk.bgColor }]}>
              <Text style={[styles.riskBadgeText, { color: selectedRisk.textColor }]}>{selectedRisk.label}</Text>
            </View>
          </View>
          <View style={styles.mapInfoHeaderActions}>
            {selectedBlock?.mapUrl ? (
              <Pressable style={styles.mapInfoNavButton} onPress={() => void onOpenMap()}>
                <Text style={styles.mapInfoNavText}>导航</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text style={styles.mapInfoTitle}>{selectedBlock?.poi || "未选地点"}</Text>
        <Text style={styles.mapInfoDesc}>{selectedBlock ? blockReasonLine(selectedBlock) : "先生成行程或切换日期"}</Text>
        <View style={styles.quickActionRow}>
          <Pressable
            style={[styles.quickActionButton, !selectedBlock?.alternatives?.length ? styles.quickActionDisabled : null]}
            disabled={!selectedBlock?.alternatives?.length}
            onPress={() => {
              if (!selectedBlock?.alternatives?.length || !selectedBlock) return;
              onPickAlternative(selectedBlock, selectedBlock.alternatives[0]);
            }}
          >
            <Text style={styles.quickActionText}>换一个</Text>
          </Pressable>
          <Pressable style={styles.quickActionButton} onPress={onAddToDraftMustGo} disabled={!selectedBlock?.poi}>
            <Text style={styles.quickActionText}>加入草案</Text>
          </Pressable>
          <Pressable style={styles.quickActionButton} onPress={() => void onAskAI()} disabled={loading || !selectedBlock}>
            <Text style={styles.quickActionText}>问 AI</Text>
          </Pressable>
        </View>

        {selectedBlock?.blockType === "food" ? (
          <View style={styles.mapInfoSection}>
            <Text style={styles.mapInfoSectionTitle}>餐馆</Text>
            <Text style={styles.mapInfoLine}>时段：{mealPeriodLabel(selectedBlock)}</Text>
            <Text style={styles.mapInfoLine}>预算：{mealBudgetHint(budget)}</Text>
            <Text style={styles.mapInfoLine}>建议：{mealSuggestion(selectedBlock)}</Text>
            <Text style={styles.mapInfoLine}>风险：{selectedBlock.weatherRisk || "当前风险较低"}</Text>
          </View>
        ) : (
          <View style={styles.mapInfoSection}>
            <Text style={styles.mapInfoSectionTitle}>参观</Text>
            <Text style={styles.mapInfoLine}>建议停留：{selectedBlock ? blockDurationLabel(selectedBlock) : "--"}</Text>
            <Text style={styles.mapInfoLine}>节奏：{pace === "compact" ? "紧凑，建议预留机动时间" : "轻松，可边走边拍"}</Text>
            <Text style={styles.mapInfoLine}>风险：{selectedBlock?.weatherRisk || "暂无明显风险"}</Text>
          </View>
        )}

        {selectedBlock?.alternatives?.length ? (
          <View style={styles.mapInfoSection}>
            <Text style={styles.mapInfoSectionTitle}>替代建议</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.altScrollContent}>
              {selectedBlock.alternatives.slice(0, 4).map((alternative) => (
                <Pressable
                  key={`${selectedBlock.blockId}-${alternative.poi}`}
                  style={styles.altChip}
                  onPress={() => selectedBlock && onPickAlternative(selectedBlock, alternative)}
                >
                  <Text style={styles.altChipTitle}>{alternative.poi}</Text>
                  {alternative.note ? (
                    <Text numberOfLines={1} style={styles.altChipNote}>
                      {alternative.note}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.mapLegendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: blockAccent("sight") }]} />
            <Text style={styles.legendText}>景点</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: blockAccent("food") }]} />
            <Text style={styles.legendText}>餐馆</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: blockAccent("experience") }]} />
            <Text style={styles.legendText}>体验</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: blockAccent("night") }]} />
            <Text style={styles.legendText}>夜间</Text>
          </View>
        </View>
      </View>

      <Animated.View
        style={[
          styles.bottomSheet,
          { top: expandedTop, height: expandedHeight, transform: [{ translateY: sheetOffset }] },
        ]}
      >
        <View style={styles.sheetHandleArea} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>行程</Text>
        </View>

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent} removeClippedSubviews>
          <View style={styles.metricRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>目的地</Text>
              <Text style={styles.metricValue}>{itineraryView?.destination || "--"}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>天数</Text>
              <Text style={styles.metricValue}>{itineraryView?.days.length || "--"}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>花费</Text>
              <Text style={styles.metricValue}>{formatCurrency(itineraryView?.estimatedCost || 0)}</Text>
            </View>
          </View>

          <Text style={styles.subtleText}>{status}</Text>
          {savedPlanId ? <Text style={styles.savedText}>已保存</Text> : null}

          <View style={styles.dayFilterRow}>
            <Pressable
              style={[styles.dayChip, selectedDay === "all" ? styles.dayChipActive : null]}
              onPress={() => onChangeDayFilter("all")}
            >
              <Text style={[styles.dayChipText, selectedDay === "all" ? styles.dayChipTextActive : null]}>全部</Text>
            </Pressable>

            {(itineraryView?.days || []).map((day) => (
              <Pressable
                key={`day-filter-${day.dayIndex}`}
                style={[styles.dayChip, selectedDay === day.dayIndex ? styles.dayChipActive : null]}
                onPress={() => onChangeDayFilter(day.dayIndex)}
              >
                <Text style={[styles.dayChipText, selectedDay === day.dayIndex ? styles.dayChipTextActive : null]}>
                  {groupDayLabel(day.dayIndex)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.dayFilterRow}>
            {categoryOptions.map((item) => (
              <Pressable
                key={`category-${item.value}`}
                style={[styles.dayChip, selectedCategory === item.value ? styles.dayChipActive : null]}
                onPress={() => onChangeCategoryFilter(item.value)}
              >
                <Text style={[styles.dayChipText, selectedCategory === item.value ? styles.dayChipTextActive : null]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.secondaryAction} onPress={() => void onOptimizeToday()} disabled={loading || !itinerary}>
              <Text style={styles.secondaryActionText}>{isOptimizing ? "优化中..." : "优化今天"}</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={() => void onAskAI()} disabled={loading || !selectedBlock}>
              <Text style={styles.secondaryActionText}>{isAskingAI ? "AI 分析中..." : "问AI"}</Text>
            </Pressable>
          </View>

          {foodHighlights.length ? (
            <View style={styles.foodPanel}>
              <Text style={styles.foodPanelTitle}>餐馆</Text>
              {foodHighlights.map((block) => (
                <Pressable
                  key={`food-${block.blockId}`}
                  style={[
                    styles.foodItem,
                    selectedBlock?.blockId === block.blockId ? styles.foodItemActive : null,
                  ]}
                  onPress={() => onSelectBlock(block.blockId, "food_panel")}
                >
                  <View style={[styles.foodDot, { backgroundColor: blockAccent("food") }]} />
                  <View style={styles.foodBody}>
                    <Text style={styles.foodPoi}>{block.poi || "待确认地点"}</Text>
                    <Text style={styles.foodMeta}>
                      {formatHourRange(block.startHour, block.endHour)} · {mealPeriodLabel(block)} · {mealBudgetHint(budget)}
                    </Text>
                    <Text style={styles.foodSuggestion}>{blockReasonLine(block)}</Text>
                    {block.weatherRisk ? <Text style={styles.foodWarning}>风险：{block.weatherRisk}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {visibleDays.map((day) => (
            <View key={`${day.dayIndex}-${day.date}`} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{groupDayLabel(day.dayIndex)}</Text>
                <Text style={styles.dayDate}>{day.date || "未设日期"}</Text>
              </View>

              {(dayBlocksByCategory.get(day.dayIndex) || []).length ? (
                (dayBlocksByCategory.get(day.dayIndex) || []).map((block) => (
                  <Pressable
                    key={block.blockId}
                    style={[
                      styles.blockRow,
                      selectedBlock?.blockId === block.blockId ? styles.blockRowActive : null,
                    ]}
                    onPress={() => onSelectBlock(block.blockId, "timeline_block")}
                  >
                    <View style={[styles.blockDot, { backgroundColor: blockAccent(block.blockType) }]} />
                    <View style={styles.blockBody}>
                      <View style={styles.blockMetaRow}>
                        <Text style={styles.blockTime}>{formatHourRange(block.startHour, block.endHour)}</Text>
                        <Text style={[styles.blockType, { color: blockAccent(block.blockType) }]}>{blockTypeLabel(block.blockType)}</Text>
                      </View>
                      <Text style={styles.blockPoi}>{block.poi || "待确认地点"}</Text>
                      <Text style={styles.blockDesc}>{block.title || blockTypeLabel(block.blockType)}</Text>
                      <View style={styles.blockHintRow}>
                        <View style={[styles.blockRiskBadge, { backgroundColor: riskMeta(block.riskLevel).bgColor }]}>
                          <Text style={[styles.blockRiskBadgeText, { color: riskMeta(block.riskLevel).textColor }]}>
                            {riskMeta(block.riskLevel).label}
                          </Text>
                        </View>
                        <Text numberOfLines={1} style={styles.blockHintText}>
                          {blockReasonLine(block)}
                        </Text>
                      </View>
                      {block.weatherRisk ? <Text style={styles.warningText}>天气：{block.weatherRisk}</Text> : null}
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.emptyText}>当前筛选暂无内容</Text>
              )}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputScreen: {
    flex: 1,
    backgroundColor: "#eef3fb",
  },
  inputContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 12,
  },
  inputTopBar: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  mapScreen: {
    flex: 1,
    backgroundColor: "#d6e3f4",
  },
  mapCanvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#cfe0f7",
  },
  nativeMap: {
    ...StyleSheet.absoluteFillObject,
  },
  mapGridLineHorizontal: {
    position: "absolute",
    left: 18,
    right: 18,
    top: "50%",
    borderTopWidth: 1,
    borderTopColor: "rgba(56,95,146,0.17)",
  },
  mapGridLineVertical: {
    position: "absolute",
    top: 18,
    bottom: 18,
    left: "50%",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(56,95,146,0.17)",
  },
  routeLine: {
    position: "absolute",
    height: 3,
    borderRadius: 99,
    backgroundColor: "rgba(42,102,223,0.62)",
  },
  markerWrap: {
    position: "absolute",
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  markerDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  markerDotActive: {
    width: 16,
    height: 16,
    borderWidth: 3,
    shadowColor: "#0d2039",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  markerLabelWrap: {
    position: "absolute",
    maxWidth: 220,
    backgroundColor: "rgba(14,31,50,0.86)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  markerLabelText: {
    color: "#b7d2f3",
    fontSize: 10,
    fontWeight: "700",
  },
  markerLabelPoi: {
    color: "#eff6ff",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  mapFallbackPill: {
    position: "absolute",
    bottom: 210,
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: "rgba(17,34,55,0.8)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mapFallbackText: {
    color: "#e4eefc",
    fontSize: 11,
    fontWeight: "600",
  },
  zoomButtonsWrap: {
    position: "absolute",
    right: 14,
    bottom: 230,
    gap: 8,
    zIndex: 60,
    elevation: 20,
  },
  zoomButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(18,34,53,0.86)",
    borderWidth: 1,
    borderColor: "rgba(210,224,244,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomButtonText: {
    color: "#f2f7ff",
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: -2,
  },
  heroCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: "#14243b",
    shadowColor: "#10243f",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  heroTag: {
    color: "#8fc3ff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: 6,
    color: "#f8fbff",
    fontSize: 24,
    fontWeight: "700",
  },
  heroSubtitle: {
    marginTop: 8,
    color: "#c2d2e8",
    fontSize: 13,
    lineHeight: 19,
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dde6f2",
    padding: 14,
    gap: 10,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#16283f",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0dce9",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1d314b",
    backgroundColor: "#fbfdff",
  },
  rowInputs: {
    flexDirection: "row",
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  label: {
    marginTop: 2,
    fontSize: 13,
    color: "#3f5674",
    fontWeight: "600",
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  secondaryAction: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccd9ee",
    backgroundColor: "#f4f8ff",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryActionText: {
    color: "#2e527f",
    fontSize: 12,
    fontWeight: "700",
  },
  choiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d2ddeb",
    backgroundColor: "#f7faff",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  choiceChipActive: {
    borderColor: "#2f6ae5",
    backgroundColor: "#eaf0ff",
  },
  choiceText: {
    color: "#4e6482",
    fontSize: 13,
    fontWeight: "600",
  },
  choiceTextActive: {
    color: "#245ad0",
  },
  multilineInput: {
    minHeight: 50,
    textAlignVertical: "top",
  },
  importInput: {
    minHeight: 78,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "#2a66df",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  statusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dde6f2",
    padding: 14,
    gap: 8,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#22364f",
  },
  statusText: {
    color: "#2f4563",
    fontSize: 13,
    lineHeight: 19,
  },
  mapTopBar: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  topButton: {
    borderRadius: 10,
    backgroundColor: "rgba(20,36,59,0.82)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  topButtonText: {
    color: "#e8f1ff",
    fontWeight: "700",
    fontSize: 13,
  },
  topButtonPrimary: {
    borderRadius: 10,
    backgroundColor: "rgba(42,102,223,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  topButtonPrimaryDisabled: {
    opacity: 0.55,
  },
  topButtonPrimaryText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  saveHintPill: {
    position: "absolute",
    top: 54,
    alignSelf: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    zIndex: 62,
  },
  saveHintSuccess: {
    backgroundColor: "rgba(221,248,236,0.96)",
    borderColor: "#b8e8d0",
  },
  saveHintInfo: {
    backgroundColor: "rgba(236,244,255,0.97)",
    borderColor: "#c8daf7",
  },
  saveHintError: {
    backgroundColor: "rgba(255,235,232,0.97)",
    borderColor: "#f6c8bf",
  },
  saveHintText: {
    color: "#224a7e",
    fontSize: 12,
    fontWeight: "700",
  },
  mapInfoCard: {
    position: "absolute",
    top: 64,
    left: 14,
    right: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(212,223,239,0.95)",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  mapInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  mapInfoHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  mapInfoHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  mapInfoTag: {
    fontSize: 11,
    color: "#33557d",
    fontWeight: "700",
  },
  riskBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  riskBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  mapInfoNavButton: {
    borderRadius: 999,
    backgroundColor: "#eaf1ff",
    borderWidth: 1,
    borderColor: "#c8d8f4",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mapInfoNavText: {
    fontSize: 11,
    color: "#245ad0",
    fontWeight: "700",
  },
  mapInfoTitle: {
    fontSize: 16,
    color: "#162b46",
    fontWeight: "800",
  },
  mapInfoDesc: {
    fontSize: 12,
    color: "#526883",
    lineHeight: 18,
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d4e1f3",
    backgroundColor: "#f2f7ff",
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  quickActionDisabled: {
    opacity: 0.45,
  },
  quickActionText: {
    fontSize: 11,
    color: "#2559c8",
    fontWeight: "700",
  },
  mapInfoSection: {
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5edf8",
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  mapInfoSectionTitle: {
    fontSize: 12,
    color: "#213b5a",
    fontWeight: "700",
  },
  mapInfoLine: {
    fontSize: 11,
    color: "#496280",
    lineHeight: 16,
  },
  altScrollContent: {
    gap: 8,
    paddingRight: 6,
  },
  altChip: {
    minWidth: 138,
    maxWidth: 176,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d9e5f5",
    backgroundColor: "#ffffff",
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 2,
  },
  altChipTitle: {
    color: "#224166",
    fontSize: 12,
    fontWeight: "700",
  },
  altChipNote: {
    color: "#6280a2",
    fontSize: 10,
    lineHeight: 14,
  },
  mapLegendRow: {
    marginTop: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 99,
    backgroundColor: "#eff4fb",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  legendText: {
    fontSize: 11,
    color: "#415b78",
    fontWeight: "600",
  },
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "#dce4f1",
    shadowColor: "#0f223a",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  sheetHandleArea: {
    alignItems: "center",
    paddingTop: 9,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ecf1f8",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#c5d2e5",
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#20354f",
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    paddingBottom: 24,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricItem: {
    flex: 1,
    backgroundColor: "#f5f8fd",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e9f4",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: "#627793",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1d324e",
  },
  subtleText: {
    fontSize: 12,
    color: "#506782",
  },
  savedText: {
    color: "#1f7d4f",
    fontSize: 12,
    fontWeight: "600",
  },
  dayFilterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  dayChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d2ddeb",
    backgroundColor: "#f7faff",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dayChipActive: {
    borderColor: "#2f6ae5",
    backgroundColor: "#eaf0ff",
  },
  dayChipText: {
    color: "#4e6482",
    fontSize: 12,
    fontWeight: "700",
  },
  dayChipTextActive: {
    color: "#245ad0",
  },
  foodPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e4ebf5",
    backgroundColor: "#f8fbff",
    padding: 10,
    gap: 8,
  },
  foodPanelTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#223b59",
  },
  foodItem: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5edf8",
    backgroundColor: "#ffffff",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  foodItemActive: {
    borderColor: "#ef7d32",
    backgroundColor: "#fff6ef",
  },
  foodDot: {
    width: 8,
    borderRadius: 999,
    marginTop: 6,
    marginBottom: 6,
  },
  foodBody: {
    flex: 1,
    gap: 2,
  },
  foodPoi: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1f3551",
  },
  foodMeta: {
    fontSize: 11,
    color: "#596f8a",
  },
  foodSuggestion: {
    fontSize: 11,
    color: "#5f7793",
    lineHeight: 16,
  },
  foodWarning: {
    marginTop: 1,
    fontSize: 11,
    color: "#9b5e17",
  },
  dayCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dfe7f2",
    backgroundColor: "#fbfdff",
    padding: 10,
    gap: 10,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a2f49",
  },
  dayDate: {
    fontSize: 12,
    color: "#5b708b",
  },
  blockRow: {
    flexDirection: "row",
    gap: 10,
  },
  blockRowActive: {
    transform: [{ scale: 0.995 }],
  },
  blockDot: {
    width: 8,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 8,
  },
  blockBody: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e7edf6",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  blockMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockTime: {
    fontSize: 12,
    color: "#4f6682",
    fontWeight: "600",
  },
  blockType: {
    fontSize: 11,
    fontWeight: "700",
  },
  blockPoi: {
    fontSize: 15,
    fontWeight: "700",
    color: "#162b46",
  },
  blockDesc: {
    fontSize: 12,
    color: "#546b86",
    lineHeight: 18,
  },
  blockHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  blockRiskBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  blockRiskBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  blockHintText: {
    flex: 1,
    fontSize: 11,
    color: "#4f6681",
  },
  warningText: {
    marginTop: 2,
    fontSize: 11,
    color: "#b06e1d",
    backgroundColor: "#fff6e9",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  emptyText: {
    fontSize: 13,
    color: "#60758f",
    lineHeight: 19,
  },
});
