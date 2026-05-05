import type { RouteCard as RouteCardData } from "@/domain/types";

export function RouteCard({ routeCard }: { routeCard: RouteCardData }) {
  const totalTransit = routeCard.legs.reduce((sum, leg) => sum + leg.minutes, 0);

  return (
    <article className="route-card">
      <div className="route-map">
        {routeCard.stops.map((stop, index) => (
          <span
            className="map-pin"
            key={stop.id}
            style={{ left: `${18 + index * 21}%`, top: `${32 + (index % 2) * 22}%` }}
          >
            {index + 1}
          </span>
        ))}
      </div>
      <div className="route-card-body">
        <div className="chip-row">
          <span className="chip">{routeCard.themeLabel}</span>
          <span className="chip chip-light">{routeCard.city}</span>
          <span className="chip chip-light">{routeCard.durationDays} 日</span>
        </div>
        <h2>{routeCard.title}</h2>
        <p className="route-summary">{routeCard.summary}</p>
        <div className="timeline">
          {routeCard.stops.map((stop) => (
            <a className="timeline-row" href={stop.mapUrl} key={stop.id} rel="noreferrer" target="_blank">
              <span className="time">{stop.time}</span>
              <span>
                <strong>{stop.poi}</strong>
                <em>{stop.reason}</em>
              </span>
            </a>
          ))}
        </div>
        <div className="trust-panel">
          <div>
            <span>可信度</span>
            <strong>{Math.round(routeCard.confidence * 100)}%</strong>
          </div>
          <div>
            <span>路上时间</span>
            <strong>{totalTransit} 分钟</strong>
          </div>
          <div>
            <span>预算估算</span>
            <strong>¥{routeCard.estimatedCostCny}</strong>
          </div>
        </div>
        {routeCard.degraded ? <p className="warning">当前为降级草案：{routeCard.degradedReason}</p> : null}
      </div>
    </article>
  );
}
