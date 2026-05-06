"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteStop } from "@/domain/types";
import { loadAmapJsApi, type AmapJsApi } from "./amap-js-loader";
import { RouteMiniMap } from "./RouteMiniMap";

export type StopActionType =
  | "replace"
  | "delete"
  | "add_food_before"
  | "add_rest_after"
  | "make_indoor"
  | "less_walking";

export type StopAction = {
  type: StopActionType;
  stopId: string;
  stopName: string;
};

type RouteInteractiveMapProps = {
  stops: RouteStop[];
  selectedStopId?: string;
  onSelectStop: (stopId: string) => void;
  onStopAction?: (action: StopAction) => void;
  actionsDisabled?: boolean;
  apiKey?: string;
  securityJsCode?: string;
};

type AmapMapInstance = {
  destroy?: () => void;
  setFitView?: (overlays?: unknown[]) => void;
  setCenter?: (center: [number, number]) => void;
  add?: (overlay: unknown | unknown[]) => void;
};

type AmapMarkerInstance = {
  on?: (eventName: string, handler: () => void) => void;
};

type ValidStop = {
  stop: RouteStop;
  index: number;
};

const defaultApiKey = process.env.NEXT_PUBLIC_AMAP_JS_API_KEY || "";
const defaultSecurityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE || "";
const stopActions: { type: StopActionType; label: string }[] = [
  { type: "replace", label: "替换这个点" },
  { type: "delete", label: "删除这个点" },
  { type: "add_food_before", label: "前面加吃饭点" },
  { type: "add_rest_after", label: "后面加休息点" },
  { type: "make_indoor", label: "改室内" },
  { type: "less_walking", label: "这一段少走路" }
];

function isValidStop(stop: RouteStop): boolean {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
}

function validStopsFor(stops: RouteStop[]): ValidStop[] {
  return stops.map((stop, index) => ({ stop, index })).filter(({ stop }) => isValidStop(stop));
}

function selectedStopFor(stops: RouteStop[], selectedStopId?: string): RouteStop | undefined {
  return stops.find((stop) => stop.id === selectedStopId) || stops[0];
}

function safeNavigationUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

function createMarkerContent(order: number, name: string, selected: boolean): HTMLElement {
  const marker = document.createElement("button");
  marker.className = selected ? "map-marker map-marker--selected" : "map-marker";
  marker.type = "button";
  marker.setAttribute("aria-label", `选择第 ${order} 站 ${name}`);
  marker.innerHTML = `<span>${order}</span>`;
  return marker;
}

function renderAmapRoute(
  amap: AmapJsApi,
  map: AmapMapInstance,
  validStops: ValidStop[],
  selectedStopId: string | undefined,
  onSelectStop: (stopId: string) => void,
): unknown[] {
  const overlays: unknown[] = [];
  const path = validStops.map(({ stop }) => [stop.lng, stop.lat]);

  if (path.length >= 2 && amap.Polyline) {
    overlays.push(
      new amap.Polyline({
        path,
        strokeColor: "#126b43",
        strokeOpacity: 0.92,
        strokeWeight: 6,
        strokeStyle: "solid",
        lineJoin: "round",
        lineCap: "round",
        zIndex: 30
      }),
    );
  }

  const Marker = amap.Marker;
  if (Marker) {
    const Pixel = amap.Pixel;
    validStops.forEach(({ stop, index }) => {
      const marker = new Marker({
        position: [stop.lng, stop.lat],
        content: createMarkerContent(index + 1, stop.poi, stop.id === selectedStopId),
        offset: Pixel ? new Pixel(-18, -18) : undefined,
        zIndex: stop.id === selectedStopId ? 80 : 60
      }) as AmapMarkerInstance;
      marker.on?.("click", () => onSelectStop(stop.id));
      overlays.push(marker);
    });
  }

  map.add?.(overlays);
  map.setFitView?.(overlays);

  return overlays;
}

export function RouteInteractiveMap({
  stops,
  selectedStopId,
  onSelectStop,
  onStopAction,
  actionsDisabled = false,
  apiKey = defaultApiKey,
  securityJsCode = defaultSecurityJsCode
}: RouteInteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<AmapMapInstance | null>(null);
  const overlaysRef = useRef<unknown[]>([]);
  const [mapStatus, setMapStatus] = useState(apiKey ? "loading" : "missing-key");
  const validStops = useMemo(() => validStopsFor(stops), [stops]);
  const selectedStop = selectedStopFor(stops, selectedStopId);
  const navigationUrl = selectedStop ? safeNavigationUrl(selectedStop.mapUrl) : "";

  useEffect(() => {
    if (!apiKey || !mapContainerRef.current || !validStops.length) return;
    let cancelled = false;

    loadAmapJsApi({ apiKey, securityJsCode })
      .then((amap) => {
        if (cancelled || !mapContainerRef.current) return;
        const map = new amap.Map(mapContainerRef.current, {
          zoom: 13,
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          resizeEnable: true
        }) as AmapMapInstance;
        mapRef.current = map;
        overlaysRef.current = renderAmapRoute(amap, map, validStops, selectedStopId, onSelectStop);
        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("failed");
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      overlaysRef.current = [];
    };
  }, [apiKey, securityJsCode, validStops, selectedStopId, onSelectStop]);

  useEffect(() => {
    if (!selectedStop || mapStatus !== "ready") return;
    mapRef.current?.setCenter?.([selectedStop.lng, selectedStop.lat]);
  }, [mapStatus, selectedStop]);

  const showFallback = mapStatus === "missing-key" || mapStatus === "failed" || !validStops.length;

  return (
    <div className="route-map-workbench">
      <div className="route-map-canvas-shell">
        {showFallback ? (
          <div className="route-map-fallback">
            <RouteMiniMap stops={stops} />
            <p>
              {mapStatus === "failed"
                ? "地图加载失败，已切换为路线预览。"
                : mapStatus === "missing-key"
                  ? "动态地图未配置，已显示路线预览。"
                  : "暂无有效坐标，先看路线点位列表。"}
            </p>
          </div>
        ) : (
          <>
            <div className="route-amap-canvas" ref={mapContainerRef} />
            {mapStatus === "loading" ? <div className="route-map-loading">正在唤起真实地图...</div> : null}
          </>
        )}
      </div>
      {selectedStop ? (
        <aside className="route-selected-stop">
          <span>当前点位</span>
          <strong>
            {selectedStop.time} · {selectedStop.poi}
          </strong>
          {selectedStop.address ? <em>{selectedStop.address}</em> : null}
          <p>{selectedStop.reason}</p>
          <small>{selectedStop.risk}</small>
          {onStopAction ? (
            <div className="route-stop-actions" aria-label="点位编辑">
              {stopActions.map((action) => (
                <button
                  disabled={actionsDisabled}
                  key={action.type}
                  onClick={() =>
                    onStopAction({
                      type: action.type,
                      stopId: selectedStop.id,
                      stopName: selectedStop.poi
                    })
                  }
                  type="button"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="route-navigation-actions" aria-label="导航方式">
            <span>导航方式</span>
            {navigationUrl ? (
              <a href={navigationUrl} target="_blank" rel="noreferrer">
                高德导航
              </a>
            ) : (
              <small>导航链接待确认</small>
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
