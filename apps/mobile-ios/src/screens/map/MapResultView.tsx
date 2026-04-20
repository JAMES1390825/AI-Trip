import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { TripApiClient } from "../../api/client";
import { RUNTIME_CONFIG } from "../../config/runtime";
import type { ItineraryBlock, ItineraryLeg, ItineraryView, ValidationResult } from "../../types/itinerary";
import { blockHasCoord, clamp, formatHourRange, groupDayLabel, toItineraryView } from "../../utils/itinerary";
import { PoiDetailSheet } from "./PoiDetailSheet";

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

type MapLibraryModule = {
  default?: React.ComponentType<any>;
  Marker?: React.ComponentType<any>;
  Polyline?: React.ComponentType<any>;
};

type SaveHintTone = "success" | "info" | "error";

type DaySelection = "all" | number;

type MapResultViewProps = {
  itinerary: Record<string, unknown>;
  onBack: () => void;
  onPlanSaved?: (savedPlanId: string, itinerary: Record<string, unknown>) => void;
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

const defaultMapRegion: NativeMapRegion = {
  latitude: 31.2304,
  longitude: 121.4737,
  latitudeDelta: 0.3,
  longitudeDelta: 0.3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  return `¥${Math.round(value)}`;
}

function blockAccent(blockType: string): string {
  switch (blockType) {
    case "food":
      return "#ef7d32";
    case "experience":
      return "#11a58b";
    case "night":
      return "#6658d8";
    default:
      return "#14c3dc";
  }
}

function blockTypeText(blockType: string): string {
  switch (blockType) {
    case "food":
      return "餐馆";
    case "experience":
      return "体验";
    case "night":
      return "夜游";
    default:
      return "景点";
  }
}

function riskMeta(level: string): { label: string; textColor: string; bgColor: string } {
  switch (String(level || "").toLowerCase()) {
    case "high":
      return { label: "高风险", textColor: "#a13b13", bgColor: "#ffe7da" };
    case "medium":
      return { label: "中风险", textColor: "#94650d", bgColor: "#fff3d7" };
    default:
      return { label: "低风险", textColor: "#1d7a56", bgColor: "#ddf7ea" };
  }
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
  if (width <= 40 || height <= 40) return { points: [], routes: [] };
  const coords: Array<{ lat: number; lon: number }> = [];
  for (const block of blocks) {
    if (blockHasCoord(block)) coords.push({ lat: block.poiLat, lon: block.poiLon });
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
  const padding = 22;
  const canvasWidth = Math.max(10, width - padding * 2);
  const canvasHeight = Math.max(10, height - padding * 2);

  function project(lat: number, lon: number): { x: number; y: number } {
    const x = ((lon - minLon) / lonSpan) * canvasWidth + padding;
    const y = ((maxLat - lat) / latSpan) * canvasHeight + padding;
    return { x, y };
  }

  return {
    points: blocks
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
      }),
    routes: legs.map((leg, idx) => {
      const from = project(leg.fromLat, leg.fromLon);
      const to = project(leg.toLat, leg.toLon);
      return {
        key: `route-${leg.dayIndex}-${idx}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      };
    }),
  };
}

function buildNativeMapData(blocks: ItineraryBlock[], legs: ItineraryLeg[]): { markers: NativeMapMarker[]; routes: NativeMapLeg[] } {
  return {
    markers: blocks
      .filter(blockHasCoord)
      .map((block) => ({
        key: block.blockId,
        poi: block.poi,
        blockType: block.blockType,
        timeLabel: formatHourRange(block.startHour, block.endHour),
        mapUrl: block.mapUrl,
        coordinate: { latitude: block.poiLat, longitude: block.poiLon },
      })),
    routes: legs.map((leg, idx) => ({
      key: `native-${leg.dayIndex}-${idx}`,
      coordinates: [
        { latitude: leg.fromLat, longitude: leg.fromLon },
        { latitude: leg.toLat, longitude: leg.toLon },
      ],
    })),
  };
}

function buildNativeMapRegion(markers: NativeMapMarker[], routes: NativeMapLeg[]): NativeMapRegion | null {
  const coords: GeoPoint[] = [];
  markers.forEach((item) => coords.push(item.coordinate));
  routes.forEach((route) => route.coordinates.forEach((point) => coords.push(point)));
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

function routePreview(day: ItineraryView["days"][number]): string {
  const points = day.blocks.map((block) => block.poi).filter(Boolean);
  return points.length ? points.join(" -> ") : "待补齐路线";
}

function dayTransitMinutes(legs: ItineraryLeg[], dayIndex: number): number {
  return legs.filter((leg) => leg.dayIndex === dayIndex).reduce((sum, item) => sum + item.minutes, 0);
}

function currentISODate(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function sourceModeLabel(value: string): string {
  switch (String(value || "").trim()) {
    case "provider":
      return "真实地图数据";
    case "fallback":
      return "内置事实草案";
    case "rules_legacy":
      return "旧版规则生成";
    default:
      return "未标记来源";
  }
}

function providerLabel(value: string): string {
  switch (String(value || "").trim().toLowerCase()) {
    case "builtin":
      return "内置数据源";
    case "amap":
    case "gaode":
      return "高德地图";
    case "google":
    case "google_maps":
      return "谷歌地图";
    default:
      return "地图数据源";
  }
}

function degradedReasonLabel(value: string): string {
  switch (String(value || "").trim()) {
    case "provider_coverage_low":
      return "真实地图数据覆盖不足，当前仍是内置事实草案。";
    case "validation_not_passed":
      return "当前结果还没有通过最终校验。";
    case "destination_custom_unresolved":
      return "目的地还没有完成标准化确认。";
    default:
      return value ? `降级原因：${value}` : "";
  }
}

function withValidationResult(input: Record<string, unknown>, validation: ValidationResult): Record<string, unknown> {
  const next = cloneItinerary(input);
  next.validation_result = {
    passed: validation.passed,
    confidence_tier: validation.confidenceTier,
    issues: validation.issues.map((item) => ({ code: item.code, message: item.message })),
    coverage: {
      provider_grounded_blocks: validation.coverage.providerGroundedBlocks,
      route_evidence_coverage: validation.coverage.routeEvidenceCoverage,
      weather_evidence_coverage: validation.coverage.weatherEvidenceCoverage,
      must_go_hit_rate: validation.coverage.mustGoHitRate,
    },
  };
  return next;
}

function cloneItinerary(input: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}

function findDiagnostics(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  return asArray(raw.diagnostics).filter((item): item is Record<string, unknown> => isRecord(item));
}

export function MapResultView({ itinerary, onBack, onPlanSaved }: MapResultViewProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const [localItinerary, setLocalItinerary] = useState<Record<string, unknown>>(itinerary);
  const [status, setStatus] = useState("已生成地图行程");
  const [selectedDay, setSelectedDay] = useState<DaySelection>("all");
  const [todayMode, setTodayMode] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [showPoiDetail, setShowPoiDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState("");
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState("");
  const [saveHint, setSaveHint] = useState<{ text: string; tone: SaveHintTone } | null>(null);
  const itineraryView = useMemo(() => toItineraryView(localItinerary), [localItinerary]);
  const mapRef = useRef<any>(null);
  const mapZoomRef = useRef(12.8);
  const mapRegionRef = useRef<NativeMapRegion>(defaultMapRegion);
  const [showRecommended, setShowRecommended] = useState(true);

  useEffect(() => {
    setLocalItinerary(itinerary);
    setSavedPlanId("");
    setLastSavedFingerprint("");
  }, [itinerary]);

  const todayIndex = useMemo(() => {
    if (!itineraryView) return null;
    const today = currentISODate();
    const found = itineraryView.days.find((day) => day.date === today);
    return found ? found.dayIndex : null;
  }, [itineraryView]);

  useEffect(() => {
    if (todayIndex === null) return;
    setTodayMode(true);
    setSelectedDay(todayIndex);
  }, [todayIndex]);

  useEffect(() => {
    if (!saveHint) return;
    const timer = setTimeout(() => setSaveHint(null), 2200);
    return () => clearTimeout(timer);
  }, [saveHint]);

  const effectiveDay = todayMode ? todayIndex ?? (selectedDay === "all" ? 0 : selectedDay) : selectedDay;

  const visibleDays = useMemo(() => {
    if (!itineraryView) return [];
    if (effectiveDay === "all") return itineraryView.days;
    return itineraryView.days.filter((day) => day.dayIndex === effectiveDay);
  }, [effectiveDay, itineraryView]);

  const visibleBlocks = useMemo(() => visibleDays.flatMap((day) => day.blocks), [visibleDays]);
  const mapBlocks = useMemo(() => (showRecommended ? visibleBlocks : []), [showRecommended, visibleBlocks]);
  const visibleLegs = useMemo(() => {
    if (!itineraryView) return [];
    if (effectiveDay === "all") return itineraryView.legs;
    return itineraryView.legs.filter((leg) => leg.dayIndex === effectiveDay);
  }, [effectiveDay, itineraryView]);

  const blockById = useMemo(() => {
    const map = new Map<string, ItineraryBlock>();
    visibleBlocks.forEach((block) => map.set(block.blockId, block));
    return map;
  }, [visibleBlocks]);

  useEffect(() => {
    if (!visibleBlocks.length) {
      setSelectedBlockId("");
      return;
    }
    if (!selectedBlockId || !blockById.has(selectedBlockId)) {
      setSelectedBlockId(visibleBlocks[0].blockId);
    }
  }, [blockById, selectedBlockId, visibleBlocks]);

  const selectedBlock = useMemo(() => {
    if (!visibleBlocks.length) return null;
    return blockById.get(selectedBlockId) || visibleBlocks[0];
  }, [blockById, selectedBlockId, visibleBlocks]);

  const selectedRisk = useMemo(() => riskMeta(selectedBlock?.riskLevel || "low"), [selectedBlock?.riskLevel]);

  const diagnostics = useMemo(() => findDiagnostics(localItinerary), [localItinerary]);
  const summaryByDayIndex = useMemo(() => {
    const map = new Map<number, ItineraryView["daySummaries"][number]>();
    (itineraryView?.daySummaries || []).forEach((item) => map.set(item.dayIndex, item));
    return map;
  }, [itineraryView?.daySummaries]);

  const mapProjection = useMemo(
    () => buildMapProjection(mapBlocks, visibleLegs, mapSize.width, mapSize.height),
    [mapBlocks, mapSize.height, mapSize.width, visibleLegs],
  );
  const nativeMapData = useMemo(() => buildNativeMapData(mapBlocks, visibleLegs), [mapBlocks, visibleLegs]);
  const nativeMapRegion = useMemo(
    () => buildNativeMapRegion(nativeMapData.markers, nativeMapData.routes),
    [nativeMapData.markers, nativeMapData.routes],
  );

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
    if (!NativeMapView || !selectedBlock || !mapRef.current) return;
    const marker = nativeMapData.markers.find((item) => item.key === selectedBlock.blockId);
    if (!marker) return;
    const mapInst = mapRef.current as any;
    const nextZoom = clamp(mapZoomRef.current, 6, 18.5);

    if (Platform.OS !== "ios" && typeof mapInst.animateCamera === "function") {
      mapInst.animateCamera({ center: marker.coordinate, zoom: nextZoom }, { duration: 260 });
      return;
    }

    if (typeof mapInst.animateToRegion === "function") {
      const nextRegion = regionFromZoom(marker.coordinate, nextZoom);
      mapRegionRef.current = nextRegion;
      mapZoomRef.current = approxZoomFromRegion(nextRegion);
      mapInst.animateToRegion(nextRegion, 260);
    }
  }, [nativeMapData.markers, selectedBlock]);

  const currentDay = useMemo(() => {
    if (!visibleDays.length) return null;
    return visibleDays[0];
  }, [visibleDays]);
  const currentSummary = useMemo(() => {
    if (!currentDay) return null;
    return summaryByDayIndex.get(currentDay.dayIndex) || null;
  }, [currentDay, summaryByDayIndex]);

  async function ensureSavedPlan(nextItinerary: Record<string, unknown> = localItinerary): Promise<string> {
    const nextFingerprint = stableSerialize(nextItinerary);
    if (savedPlanId && lastSavedFingerprint === nextFingerprint) return savedPlanId;
    const result = await api.savePlan(nextItinerary);
    const id = String(result.saved_plan_id || result.id || "");
    setSavedPlanId(id);
    setLastSavedFingerprint(nextFingerprint);
    if (id) onPlanSaved?.(id, nextItinerary);
    return id;
  }

  async function handleSave() {
    setIsSaving(true);
    setStatus("保存前校验中...");
    setSaveHint({ text: "保存中", tone: "info" });
    try {
      const validation = await api.validateItinerary(localItinerary, false);
      const validatedItinerary = withValidationResult(localItinerary, validation);
      setLocalItinerary(validatedItinerary);
      if (!validation.passed) {
        const firstIssue = validation.issues[0]?.message || "当前结果还需要进一步确认，暂不建议保存";
        setStatus(firstIssue);
        setSaveHint({ text: "校验未通过", tone: "error" });
        return;
      }

      await ensureSavedPlan(validatedItinerary);
      setStatus("已保存");
      setSaveHint({ text: "已保存", tone: "success" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setSaveHint({ text: "保存失败", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleNavigate() {
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
    } catch {
      setStatus("打开导航失败");
    }
  }

  function openBlockDetail(block: ItineraryBlock) {
    setSelectedBlockId(block.blockId);
    setShowPoiDetail(true);
  }

  if (!itineraryView) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>行程解析失败</Text>
        <Text style={styles.emptyText}>当前数据格式暂时无法渲染新版地图页。</Text>
        <Pressable style={styles.emptyButton} onPress={onBack}>
          <Text style={styles.emptyButtonText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View
        style={styles.mapArea}
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
                strokeColor="rgba(20,195,220,0.72)"
                strokeWidth={5}
              />
            ))}
            {nativeMapData.markers.map((item) => (
              <NativeMarker
                key={item.key}
                coordinate={item.coordinate}
                title={item.poi || "待确认地点"}
                description={item.timeLabel}
                pinColor={blockAccent(item.blockType)}
                onPress={() => {
                  const block = blockById.get(item.key);
                  if (block) {
                    openBlockDetail(block);
                    return;
                  }
                  setSelectedBlockId(item.key);
                }}
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
                style={[styles.markerWrap, { left: point.x - 11, top: point.y - 11 }]}
                onPress={() => {
                  const block = blockById.get(point.key);
                  if (block) {
                    openBlockDetail(block);
                    return;
                  }
                  setSelectedBlockId(point.key);
                }}
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
          </>
        )}

        <View style={styles.topBar}>
          <Pressable style={styles.topButton} onPress={onBack}>
            <Text style={styles.topButtonText}>返回</Text>
          </Pressable>
          <View style={styles.topActions}>
            <Pressable style={styles.topActionGhost} onPress={() => setShowRecommended((prev) => !prev)}>
              <Text style={styles.topActionGhostText}>{showRecommended ? "推荐地点" : "只看路线"}</Text>
            </Pressable>
            <Pressable style={styles.topActionPrimary} onPress={() => void handleSave()} disabled={isSaving}>
              <Text style={styles.topActionPrimaryText}>{isSaving ? "保存中..." : "保存"}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {saveHint ? (
        <View
          style={[
            styles.saveHint,
            saveHint.tone === "success" ? styles.saveHintSuccess : null,
            saveHint.tone === "error" ? styles.saveHintError : null,
          ]}
        >
          <Text style={styles.saveHintText}>{saveHint.text}</Text>
        </View>
      ) : null}

      <View style={styles.sheet}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHandleWrap}>
            <View style={styles.sheetHandle} />
          </View>

          <View style={styles.inlineInfoCard}>
            <View style={styles.inlineInfoHeader}>
              <Text style={styles.inlineInfoTag}>
                {selectedBlock ? `${blockTypeText(selectedBlock.blockType)} · ${formatHourRange(selectedBlock.startHour, selectedBlock.endHour)}` : "地点"}
              </Text>
              <View style={[styles.inlineRiskBadge, { backgroundColor: selectedRisk.bgColor }]}>
                <Text style={[styles.inlineRiskText, { color: selectedRisk.textColor }]}>{selectedRisk.label}</Text>
              </View>
            </View>
            <Text style={styles.inlineInfoTitle}>{selectedBlock?.poi || itineraryView.destination || "未选地点"}</Text>
            <Text style={styles.inlineInfoText}>
              {selectedBlock?.recommendReason || "信息收在底部抽屉里，你可以先看地图，再上拉浏览每天路线。"}
            </Text>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              style={[styles.modeChip, !todayMode ? styles.modeChipActive : null]}
              onPress={() => {
                setTodayMode(false);
                setSelectedDay("all");
              }}
            >
              <Text style={[styles.modeChipText, !todayMode ? styles.modeChipTextActive : null]}>总览</Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, todayMode ? styles.modeChipActive : null]}
              onPress={() => {
                if (todayIndex !== null) {
                  setSelectedDay(todayIndex);
                  setTodayMode(true);
                }
              }}
            >
              <Text style={[styles.modeChipText, todayMode ? styles.modeChipTextActive : null]}>今天</Text>
            </Pressable>
            {itineraryView.days.map((day) => {
              const active = !todayMode && selectedDay === day.dayIndex;
              return (
                <Pressable
                  key={`day-${day.dayIndex}`}
                  style={[styles.modeChip, active ? styles.modeChipActive : null]}
                  onPress={() => {
                    setTodayMode(false);
                    setSelectedDay(day.dayIndex);
                  }}
                >
                  <Text style={[styles.modeChipText, active ? styles.modeChipTextActive : null]}>
                    {day.date.slice(5).replace("-", ".")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {itineraryView.todayHint ? (
            <View style={styles.todayHintCard}>
              <Text style={styles.todayHintLabel}>今天建议</Text>
              <Text style={styles.todayHintTitle}>{itineraryView.todayHint.title || "先看今天路线"}</Text>
              {itineraryView.todayHint.nextPoi ? (
                <Text style={styles.todayHintText}>下一站建议先去 {itineraryView.todayHint.nextPoi}</Text>
              ) : (
                <Text style={styles.todayHintText}>可以直接切到今天模式，快速确认下一站。</Text>
              )}
            </View>
          ) : null}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {currentDay ? `${currentDay.date} ${groupDayLabel(currentDay.dayIndex)}` : `${itineraryView.destination} 总览`}
            </Text>
            <Text style={styles.summaryRoute}>
              {currentSummary?.title || (currentDay ? routePreview(currentDay) : "切换某一天查看详细路线")}
            </Text>
            {currentSummary?.preview ? <Text style={styles.summaryPreview}>{currentSummary.preview}</Text> : null}
            <Text style={styles.summaryMeta}>
              预算 {formatCurrency(itineraryView.estimatedCost)} · 通勤{" "}
              {currentDay
                ? `${currentSummary?.transitMinutes ?? dayTransitMinutes(itineraryView.legs, currentDay.dayIndex)} 分钟`
                : "多日"}
            </Text>
          </View>

          {diagnostics.length ? (
            <View style={styles.diagnosticCard}>
              <Text style={styles.diagnosticTitle}>提醒</Text>
              {diagnostics.slice(0, 3).map((item, idx) => (
                <Text key={`diag-${idx}`} style={styles.diagnosticText}>
                  {String(item.message || item.code || "存在需要确认的信息")}
                </Text>
              ))}
            </View>
          ) : null}

          {itineraryView.warnings.length ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>当前说明</Text>
              <Text style={styles.warningText}>
                数据来源：{sourceModeLabel(itineraryView.sourceMode)} · {providerLabel(itineraryView.mapProvider)}
              </Text>
              {itineraryView.degraded ? (
                <Text style={styles.warningText}>{degradedReasonLabel(itineraryView.degradedReason)}</Text>
              ) : null}
              {itineraryView.warnings.slice(0, 3).map((item) => (
                <Text key={item} style={styles.warningText}>
                  {item}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.assetRow}>
            <View style={[styles.assetCard, styles.assetCardWarm]}>
              <Text style={styles.assetCardTitle}>便签</Text>
              <Text style={styles.assetCardText}>为这次路线留点出发前提醒和拍照想法。</Text>
            </View>
            <View style={[styles.assetCard, styles.assetCardCool]}>
              <Text style={styles.assetCardTitle}>行李清单</Text>
              <Text style={styles.assetCardText}>下一步可以接出行物品快速添加。</Text>
            </View>
          </View>

          <View style={styles.primaryActionRow}>
            <Pressable style={styles.primaryActionButton} onPress={() => void handleNavigate()}>
              <Text style={styles.primaryActionButtonText}>导航到当前地点</Text>
            </Pressable>
          </View>

          <View style={styles.poiList}>
            {visibleDays.map((day) => (
              <View key={`section-${day.dayIndex}`} style={styles.daySection}>
                <Text style={styles.daySectionTitle}>
                  {day.date} {todayIndex === day.dayIndex ? "· 今天" : ""}
                </Text>

                {day.blocks.map((block, idx) => {
                  const risk = riskMeta(block.riskLevel);
                  const leg = itineraryView.legs.find((item) => item.dayIndex === day.dayIndex && item.toPoi === block.poi);
                  return (
                    <Pressable
                      key={block.blockId}
                      style={[
                        styles.poiCard,
                        selectedBlock?.blockId === block.blockId ? styles.poiCardActive : null,
                      ]}
                      onPress={() => openBlockDetail(block)}
                    >
                      <View style={[styles.poiThumb, { backgroundColor: blockAccent(block.blockType) }]}>
                        <Text style={styles.poiThumbText}>{idx + 1}</Text>
                      </View>
                      <View style={styles.poiBody}>
                        <View style={styles.poiHeaderRow}>
                          <Text style={styles.poiType}>{blockTypeText(block.blockType)}</Text>
                          <View style={[styles.poiRiskBadge, { backgroundColor: risk.bgColor }]}>
                            <Text style={[styles.poiRiskText, { color: risk.textColor }]}>{risk.label}</Text>
                          </View>
                        </View>
                        <Text style={styles.poiTitle}>
                          {idx + 1}. {block.poi}
                        </Text>
                        <Text style={styles.poiDesc}>{block.recommendReason || block.title || "已按动线安排"}</Text>
                        <Text style={styles.poiMeta}>{formatHourRange(block.startHour, block.endHour)}</Text>
                        {leg ? <Text style={styles.poiTransit}>步行/交通约 {leg.minutes} 分钟</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <PoiDetailSheet
        visible={showPoiDetail}
        block={selectedBlock}
        onClose={() => setShowPoiDetail(false)}
        onNavigate={() => void handleNavigate()}
      />

      <View style={styles.statusBar}>
        <Text numberOfLines={2} style={styles.statusBarText}>
          {status}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#e8f2fb",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#eef6ff",
  },
  emptyTitle: {
    color: "#0d1723",
    fontSize: 22,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 10,
    color: "#6a7e90",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 18,
    borderRadius: 20,
    backgroundColor: "#0d1117",
    paddingHorizontal: 26,
    paddingVertical: 14,
  },
  emptyButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  mapArea: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: "#dcecf8",
  },
  nativeMap: {
    ...StyleSheet.absoluteFillObject,
  },
  mapGridLineHorizontal: {
    position: "absolute",
    left: 20,
    right: 20,
    top: "50%",
    height: 1,
    backgroundColor: "rgba(17,37,58,0.08)",
  },
  mapGridLineVertical: {
    position: "absolute",
    top: 28,
    bottom: 28,
    left: "50%",
    width: 1,
    backgroundColor: "rgba(17,37,58,0.08)",
  },
  routeLine: {
    position: "absolute",
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(20,195,220,0.72)",
  },
  markerWrap: {
    position: "absolute",
  },
  markerDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  markerDotActive: {
    transform: [{ scale: 1.18 }],
  },
  topBar: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 3,
  },
  topButton: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topButtonText: {
    color: "#111b27",
    fontSize: 14,
    fontWeight: "800",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topActionGhost: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topActionGhostText: {
    color: "#1d2c3c",
    fontSize: 13,
    fontWeight: "800",
  },
  topActionPrimary: {
    borderRadius: 18,
    backgroundColor: "#0d1117",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topActionPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  inlineInfoCard: {
    borderRadius: 22,
    backgroundColor: "#f7fbff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#dde8f2",
  },
  inlineInfoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inlineInfoTag: {
    color: "#5d7182",
    fontSize: 13,
    fontWeight: "800",
  },
  inlineRiskBadge: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  inlineRiskText: {
    fontSize: 12,
    fontWeight: "800",
  },
  inlineInfoTitle: {
    marginTop: 8,
    color: "#0a1320",
    fontSize: 20,
    fontWeight: "800",
  },
  inlineInfoText: {
    marginTop: 6,
    color: "#627787",
    fontSize: 13,
    lineHeight: 19,
  },
  saveHint: {
    position: "absolute",
    top: 86,
    alignSelf: "center",
    zIndex: 10,
    borderRadius: 18,
    backgroundColor: "#edf3fb",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  saveHintSuccess: {
    backgroundColor: "#e1f8ec",
  },
  saveHintError: {
    backgroundColor: "#ffe8e1",
  },
  saveHintText: {
    color: "#102033",
    fontSize: 13,
    fontWeight: "800",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: "36%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#ffffff",
    shadowColor: "#7a92aa",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 100,
    gap: 14,
  },
  sheetHandleWrap: {
    alignItems: "center",
    paddingBottom: 2,
  },
  sheetHandle: {
    width: 54,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#d1dbe6",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeChip: {
    borderRadius: 16,
    backgroundColor: "#f1f5f8",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modeChipActive: {
    backgroundColor: "#0d1117",
  },
  modeChipText: {
    color: "#607487",
    fontSize: 13,
    fontWeight: "800",
  },
  modeChipTextActive: {
    color: "#ffffff",
  },
  summaryCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 16,
    shadowColor: "#9bb0c3",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  todayHintCard: {
    borderRadius: 22,
    backgroundColor: "#f5fcff",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  todayHintLabel: {
    color: "#0f8294",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  todayHintTitle: {
    marginTop: 6,
    color: "#0d1723",
    fontSize: 17,
    fontWeight: "800",
  },
  todayHintText: {
    marginTop: 6,
    color: "#607688",
    fontSize: 13,
    lineHeight: 20,
  },
  summaryTitle: {
    color: "#0d1723",
    fontSize: 18,
    fontWeight: "800",
  },
  summaryRoute: {
    marginTop: 8,
    color: "#243749",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  summaryPreview: {
    marginTop: 8,
    color: "#5f7486",
    fontSize: 14,
    lineHeight: 21,
  },
  summaryMeta: {
    marginTop: 8,
    color: "#7a8d9e",
    fontSize: 13,
    fontWeight: "700",
  },
  diagnosticCard: {
    borderRadius: 22,
    backgroundColor: "#f8fbff",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  diagnosticTitle: {
    color: "#122031",
    fontSize: 15,
    fontWeight: "800",
  },
  diagnosticText: {
    marginTop: 8,
    color: "#65798b",
    fontSize: 13,
    lineHeight: 20,
  },
  warningCard: {
    borderRadius: 22,
    backgroundColor: "#fef7ef",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  warningTitle: {
    color: "#122031",
    fontSize: 15,
    fontWeight: "800",
  },
  warningText: {
    marginTop: 8,
    color: "#7a6034",
    fontSize: 13,
    lineHeight: 20,
  },
  learningCard: {
    borderRadius: 22,
    backgroundColor: "#eef8f4",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  learningTitle: {
    color: "#123126",
    fontSize: 15,
    fontWeight: "800",
  },
  learningText: {
    color: "#375948",
    fontSize: 13,
    lineHeight: 20,
  },
  learningMeta: {
    color: "#527565",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  assetRow: {
    flexDirection: "row",
    gap: 12,
  },
  assetCard: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 16,
    minHeight: 128,
  },
  assetCardWarm: {
    backgroundColor: "#fff0af",
  },
  assetCardCool: {
    backgroundColor: "#dfeefe",
  },
  assetCardTitle: {
    color: "#101a25",
    fontSize: 16,
    fontWeight: "800",
  },
  assetCardText: {
    marginTop: 10,
    color: "#475a6d",
    fontSize: 14,
    lineHeight: 22,
  },
  primaryActionRow: {
    flexDirection: "row",
    gap: 12,
  },
  primaryActionGhost: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#ece6ff",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  primaryActionGhostText: {
    color: "#6658d8",
    fontSize: 16,
    fontWeight: "800",
  },
  primaryActionButton: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#0d1117",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  primaryActionButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  poiList: {
    gap: 18,
  },
  daySection: {
    gap: 12,
  },
  daySectionTitle: {
    color: "#101a25",
    fontSize: 16,
    fontWeight: "800",
  },
  poiCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 14,
    shadowColor: "#a6bacb",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  poiCardActive: {
    backgroundColor: "#f6fdff",
  },
  poiThumb: {
    width: 78,
    height: 78,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  poiThumbText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  poiBody: {
    flex: 1,
  },
  poiHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  poiType: {
    color: "#54a266",
    fontSize: 14,
    fontWeight: "800",
  },
  poiRiskBadge: {
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  poiRiskText: {
    fontSize: 12,
    fontWeight: "800",
  },
  poiTitle: {
    marginTop: 6,
    color: "#0d1723",
    fontSize: 20,
    fontWeight: "800",
  },
  poiDesc: {
    marginTop: 6,
    color: "#4f6375",
    fontSize: 15,
    lineHeight: 22,
  },
  poiMeta: {
    marginTop: 8,
    color: "#6f8395",
    fontSize: 13,
    fontWeight: "700",
  },
  poiTransit: {
    marginTop: 6,
    color: "#9ab0c1",
    fontSize: 13,
    fontWeight: "700",
  },
  poiBasisText: {
    marginTop: 6,
    color: "#48657f",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  loadingPill: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 76,
    borderRadius: 18,
    backgroundColor: "rgba(12,17,23,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 40,
  },
  loadingPillText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  statusBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 22,
  },
  statusBarText: {
    color: "#243647",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
});
