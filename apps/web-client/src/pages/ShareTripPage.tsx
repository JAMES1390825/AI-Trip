import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  cityLabel,
  collectMapPoints,
  getConfig,
  getSharedPlan,
  itineraryDateLabel,
  itineraryTitle,
  padHour,
  parseError,
  toast,
  trackEvent,
} from "../../assets/js/core";

const DAY_LINE_COLORS = ["#2f6bd9", "#ff7d4d", "#2ab6a5", "#ff4e7a", "#0ea5a1", "#6366f1"];

let amapScriptPromise: Promise<any> | null = null;

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
    throw new Error("未配置高德地图授权码。");
  }

  if (!amapScriptPromise) {
    amapScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-amap-sdk='true']") as HTMLScriptElement | null;
      if (existing) {
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

export default function ShareTripPage() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [shared, setShared] = useState<any>(null);
  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mapError, setMapError] = useState("");
  const [mapDayFilter, setMapDayFilter] = useState("");
  const [activeBlockKey, setActiveBlockKey] = useState("");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapMarkersRef = useRef<Map<string, { marker: any; sequence: string }>>(new Map());
  const mapPolylinesRef = useRef<any[]>([]);
  const mapViewTrackedRef = useRef(false);
  const mapFallbackTrackedRef = useRef(false);

  const amapKey = String(getConfig().amapJsKey || "").trim();

  useEffect(() => {
    let mounted = true;

    async function loadSharedPlan() {
      if (!token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      mapViewTrackedRef.current = false;
      mapFallbackTrackedRef.current = false;
      try {
        const payload = await getSharedPlan(token);
        if (!mounted) return;
        setShared(payload || null);
      } catch (error) {
        if (!mounted) return;
        toast(parseError(error), "warn", 4200);
        setShared(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadSharedPlan();
    return () => {
      mounted = false;
    };
  }, [token]);

  const itinerary = shared?.itinerary || null;
  const diagnostics = useMemo(() => {
    if (!itinerary) return [];
    return Array.isArray(itinerary.diagnostics) ? itinerary.diagnostics : [];
  }, [itinerary]);

  const mapPoints = useMemo(() => {
    if (!itinerary) return [];
    const days = Array.isArray(itinerary.days) ? itinerary.days : [];

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
  }, [itinerary]);

  const mapDayOptions = useMemo(() => {
    if (!itinerary) return [];
    return (itinerary.days || []).map((day: any, idx: number) => {
      const dayValue = String(Number(day.day_index ?? idx));
      return {
        value: dayValue,
        label: `第 ${Number(day.day_index ?? idx) + 1} 天 · ${day.date || ""}`,
      };
    });
  }, [itinerary]);

  const filteredMapPoints = useMemo(() => {
    if (!mapDayFilter) return mapPoints;
    const selectedDay = Number(mapDayFilter);
    return mapPoints.filter((point: any) => Number(point.dayIndex) === selectedDay);
  }, [mapDayFilter, mapPoints]);

  const activePoint = useMemo(() => {
    if (!activeBlockKey) return null;
    return mapPoints.find((point: any) => point.key === activeBlockKey) || null;
  }, [activeBlockKey, mapPoints]);

  const mapDiagnostics = useMemo(() => {
    const items: any[] = [];
    if (!itinerary) return items;

    if (!amapKey) {
      items.push({
        code: "MAP_KEY_MISSING",
        message: "当前设备未配置高德地图授权码，已降级为时间线模式。",
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
        message: mapError || "地图加载失败，可仅查看时间线。",
      });
    }

    if (mapStatus === "ready" && filteredMapPoints.length === 0) {
      items.push({
        code: "MAP_COORD_MISSING",
        message: mapDayFilter ? "当前筛选天数缺少坐标点。" : "当前行程缺少可展示坐标点。",
      });
    }

    return items;
  }, [amapKey, filteredMapPoints.length, itinerary, mapDayFilter, mapError, mapStatus]);

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

    void trackEvent("share_map_point_focused", { block_key: blockKey });
  }

  useEffect(() => {
    if (mapDayFilter && !mapDayOptions.some((item: any) => item.value === mapDayFilter)) {
      setMapDayFilter("");
    }
  }, [mapDayFilter, mapDayOptions]);

  useEffect(() => {
    if (!mapDayFilter) return;
    void trackEvent("share_map_day_filtered", { day_index: Number(mapDayFilter) });
  }, [mapDayFilter]);

  useEffect(() => {
    if (!itinerary) return;
    if (!amapKey) {
      if (!mapFallbackTrackedRef.current) {
        mapFallbackTrackedRef.current = true;
        void trackEvent("share_map_fallback_timeline", { reason: "MAP_KEY_MISSING" });
      }
      return;
    }
    if (mapDiagnostics.length > 0 && !mapFallbackTrackedRef.current) {
      mapFallbackTrackedRef.current = true;
      void trackEvent("share_map_fallback_timeline", {
        reason: mapDiagnostics.map((item: any) => String(item.code || "")).join("|"),
      });
    }
  }, [amapKey, itinerary, mapDiagnostics]);

  useEffect(() => {
    if (mapStatus !== "ready") return;
    if (!filteredMapPoints.length) return;
    if (mapViewTrackedRef.current) return;
    mapViewTrackedRef.current = true;
    void trackEvent("share_map_viewed", {
      point_count: filteredMapPoints.length,
      has_day_filter: Boolean(mapDayFilter),
    });
  }, [filteredMapPoints.length, mapDayFilter, mapStatus]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!itinerary) return;
      if (!amapKey) {
        setMapStatus("idle");
        setMapError("当前设备未配置高德地图授权码。请在本机配置后查看内嵌地图。");
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
  }, [amapKey, itinerary]);

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
          const targetNode = document.getElementById(`share-timeline-${point.key}`);
          targetNode?.scrollIntoView({ behavior: "smooth", block: "center" });
          void trackEvent("share_map_point_focused", { block_key: point.key });
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
    return () => {
      clearMapOverlays();
      if (mapInstanceRef.current?.destroy) {
        mapInstanceRef.current.destroy();
      }
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="share-layout">
      <section className="card trip-hero share-hero">
        <h1>{itinerary ? itineraryTitle(itinerary) : "分享行程"}</h1>
        <p>{itinerary ? itineraryDateLabel(itinerary) : "正在加载分享内容"}</p>
        <div className="pill-row" style={{ marginTop: "10px" }}>
          <span className="pill warn">只读模式</span>
          <span className="pill">目的地 {cityLabel(itinerary?.destination || itinerary?.request_snapshot?.destination || "")}</span>
          <span className="pill">版本 v{Number(itinerary?.version || 1)}</span>
        </div>
        <div className="trip-actions">
          <Link className="btn secondary" to="/plan">
            我也来规划
          </Link>
          <Link className="btn text" to="/">
            返回首页
          </Link>
        </div>
      </section>

      <section className="trip-layout" style={{ marginTop: "14px" }}>
        <section className="card map-card">
          {!itinerary && (
            <div className="map-empty">
              <div>
                <p>正在加载分享行程...</p>
              </div>
            </div>
          )}

          {itinerary && !amapKey && (
            <div className="map-empty">
              <div>
                <p>当前设备未配置高德地图授权码，暂时无法渲染内嵌地图。</p>
                <p>你仍可通过右侧时间线与“高德导航”链接执行行程。</p>
              </div>
            </div>
          )}

          {itinerary && amapKey && (
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
                  <div>{mapStatus === "loading" ? "地图加载中..." : mapError || "地图初始化失败，请稍后重试。"}</div>
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
                  <div>当前筛选范围内没有可展示的坐标点。</div>
                </div>
              )}

              <div className="map-overlay">
                <div className="map-hint">{activePoint ? `已高亮：${activePoint.poi}` : "点击右侧时间线，可在地图上定位对应点位"}</div>
                <div className="map-hint" style={{ pointerEvents: "auto", display: "grid", gap: "8px" }}>
                  <label style={{ fontSize: "12px", color: "#4b647a" }}>地图筛选</label>
                  <select
                    value={mapDayFilter}
                    onChange={(e) => setMapDayFilter(e.target.value)}
                    style={{ border: "1px solid rgba(29,48,68,0.2)", borderRadius: "10px", padding: "6px 8px" }}
                  >
                    <option value="">全部天数</option>
                    {mapDayOptions.map((item: any) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
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
          {loading && <div className="empty-block">正在加载分享行程...</div>}
          {!loading && !itinerary && <div className="empty-block">分享链接无效、已过期或已被关闭。</div>}

          {!!itinerary &&
            (itinerary.days || []).map((day: any, dayIdx: number) => (
              <section key={`share-day-${day.date || dayIdx}`} className="timeline-day">
                <h3>
                  第 {Number(day.day_index ?? dayIdx) + 1} 天 · {day.date || ""}
                </h3>
                {(day.blocks || []).map((block: any, blockIdx: number) => {
                  const blockKey = `${Number(day.day_index ?? dayIdx)}-${blockIdx}`;
                  const isActive = activeBlockKey === blockKey;
                  return (
                    <article
                      id={`share-timeline-${blockKey}`}
                      className={`block-item${isActive ? " active" : ""}`}
                      key={`share-block-${dayIdx}-${blockIdx}`}
                      onClick={() => focusBlockOnMap(blockKey)}
                    >
                      <div className="block-time">
                        {padHour(block.start_hour)}:00 - {padHour(block.end_hour)}:00
                      </div>
                      <div className="block-main">
                        <div className="block-title-row">
                          <strong>{block.title || "活动安排"}</strong>
                          <span className={`lock-chip${block.locked ? " on" : ""}`}>{block.locked ? "已锁定" : "未锁定"}</span>
                        </div>
                        <p>{block.poi || "行程安排"}</p>
                        {!!block.poi_map_url && (
                          <div className="block-meta">
                            <a className="inline-link" href={block.poi_map_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                              在高德中查看
                            </a>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
        </aside>
      </section>

      <section className="section">
        <section className="card summary-panel">
          <div className="summary-head">
            <h2>交通与提醒</h2>
            <p>包含交通建议、地图诊断和风险诊断，帮助同行人执行行程。</p>
          </div>

          <div>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>地图诊断</strong>
            <div className="warning-list">
              {!itinerary && !loading && <div className="warning-item">暂无可用行程数据。</div>}
              {!!itinerary && !mapDiagnostics.length && <div className="warning-item">地图状态正常。</div>}
              {mapDiagnostics.map((item: any, idx: number) => (
                <div className="warning-item" key={`share-map-diag-${idx}`}>
                  <strong>{item.code || "MAP_DIAGNOSTIC"}</strong>
                  <div>{item.message || "请稍后重试。"}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <strong style={{ fontSize: "0.95rem", color: "#2e4d69" }}>交通建议</strong>
            <div className="transit-list">
              {!loading && !(itinerary?.transit_legs || []).length && <div className="transit-item">暂无交通段信息。</div>}
              {(itinerary?.transit_legs || []).map((leg: any, idx: number) => (
                <div className="transit-item" key={`share-leg-${idx}`}>
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
              {!loading && !diagnostics.length && <div className="warning-item">当前无明显风险提醒。</div>}
              {diagnostics.map((item: any, idx: number) => (
                <div className="warning-item" key={`diag-${idx}`}>
                  <strong>{item.code || "提醒"}</strong>
                  <div>{item.message || "请结合行程实际安排。"}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
