import type { RouteStop } from "@/domain/types";

type IndexedStop = {
  stop: RouteStop;
  index: number;
};

type ProjectedStop = IndexedStop & {
  x: number;
  y: number;
};

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 220;
const MAP_PADDING = 34;
const MAX_VISIBLE_LABELS = 4;

function hasValidCoordinates({ stop }: IndexedStop): boolean {
  return Number.isFinite(stop.lat) && Number.isFinite(stop.lng);
}

function ratioForIndex(index: number, total: number): number {
  if (total <= 1) return 0.5;
  return index / (total - 1);
}

function roundPoint(value: number): number {
  return Math.round(value * 10) / 10;
}

function projectStops(stops: RouteStop[]): ProjectedStop[] {
  const indexedStops = stops.map((stop, index) => ({ stop, index }));
  const validStops = indexedStops.filter(hasValidCoordinates);

  if (!validStops.length) return [];

  const latitudes = validStops.map(({ stop }) => stop.lat);
  const longitudes = validStops.map(({ stop }) => stop.lng);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const sameLat = minLat === maxLat;
  const sameLng = minLng === maxLng;

  return validStops.map((item, projectedIndex) => {
    const routeRatio = ratioForIndex(projectedIndex, validStops.length);
    const xRatio = sameLng ? routeRatio : (item.stop.lng - minLng) / (maxLng - minLng);
    const yRatio = sameLat ? 1 - routeRatio : (maxLat - item.stop.lat) / (maxLat - minLat);

    return {
      ...item,
      x: MAP_PADDING + xRatio * (VIEWBOX_WIDTH - MAP_PADDING * 2),
      y: MAP_PADDING + yRatio * (VIEWBOX_HEIGHT - MAP_PADDING * 2)
    };
  });
}

export function RouteMiniMap({ stops }: { stops: RouteStop[] }) {
  const projectedStops = projectStops(stops);
  const linePoints = projectedStops.map(({ x, y }) => `${roundPoint(x)},${roundPoint(y)}`).join(" ");

  if (!stops.length) {
    return (
      <div className="route-mini-map route-mini-map--empty">
        <p>暂无路线点位</p>
      </div>
    );
  }

  return (
    <div className="route-mini-map" aria-label="App 内路线预览">
      <svg aria-label="路线点位相对位置" role="img" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
        {projectedStops.length >= 2 ? <polyline className="route-line" points={linePoints} /> : null}
        {projectedStops.map(({ stop, index, x, y }) => (
          <g key={stop.id} transform={`translate(${roundPoint(x)}, ${roundPoint(y)})`}>
            <circle className="route-point" r="15" />
            <text className="route-point-number" dominantBaseline="central" textAnchor="middle">
              {index + 1}
            </text>
          </g>
        ))}
        {projectedStops.slice(0, MAX_VISIBLE_LABELS).map(({ stop, x, y }) => (
          <text className="route-point-label" key={`${stop.id}-label`} x={roundPoint(x + 18)} y={roundPoint(y - 16)}>
            {stop.poi}
          </text>
        ))}
        {!projectedStops.length ? (
          <text className="route-empty-label" textAnchor="middle" x={VIEWBOX_WIDTH / 2} y={VIEWBOX_HEIGHT / 2}>
            暂无有效坐标
          </text>
        ) : null}
      </svg>
      <p className="route-map-caption">App 内路线预览 · 动态地图不可用时保留路线结构</p>
      <div aria-label="路线站点" className="route-map-stops">
        {stops.map((stop, index) => (
          <span className="route-map-stop-chip" key={stop.id}>
            <b>{index + 1}</b>
            {stop.poi}
          </span>
        ))}
      </div>
    </div>
  );
}
