import type { RouteCard as RouteCardData } from "@/domain/types";

export function RouteCard({ routeCard }: { routeCard: RouteCardData }) {
  const totalTransit = routeCard.legs.reduce((sum, leg) => sum + leg.minutes, 0);
  const riskItems = Array.from(new Set([...(routeCard.riskTips || []), ...(routeCard.providerWarnings || [])]));

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
          {routeCard.planningMode ? <span className="chip chip-light">{routeCard.planningMode}</span> : null}
        </div>
        <h2>{routeCard.title}</h2>
        <p className="route-summary">{routeCard.summary}</p>
        {routeCard.intentSummary || routeCard.arrangementReason || routeCard.skipSuggestion || routeCard.weatherAlternative ? (
          <div className="explain-panel">
            {routeCard.intentSummary ? (
              <div>
                <span>路线构思</span>
                <p>{routeCard.intentSummary}</p>
              </div>
            ) : null}
            {routeCard.arrangementReason ? (
              <div>
                <span>这样安排的原因</span>
                <p>{routeCard.arrangementReason}</p>
              </div>
            ) : null}
            {routeCard.skipSuggestion ? (
              <div>
                <span>太累就跳过</span>
                <p>{routeCard.skipSuggestion}</p>
              </div>
            ) : null}
            {routeCard.weatherAlternative ? (
              <div>
                <span>天气变化备选</span>
                <p>{routeCard.weatherAlternative}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="timeline">
          {routeCard.stops.map((stop) => (
            <a className="timeline-row" href={stop.mapUrl} key={stop.id} rel="noreferrer" target="_blank">
              <span className="time">{stop.time}</span>
              <span>
                <strong>{stop.poi}</strong>
                {stop.address ? <small>{stop.address}</small> : null}
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
        <div className="route-meta">
          <div>
            <span>适合人群</span>
            <p>{routeCard.fitFor}</p>
          </div>
          <div>
            <span>路线亮点</span>
            <ul>
              {routeCard.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </div>
          <div>
            <span>数据来源</span>
            <p>{routeCard.sourceLabel}</p>
          </div>
        </div>
        <div className="risk-list">
          {riskItems.map((tip) => (
            <span key={tip}>{tip}</span>
          ))}
        </div>
        {routeCard.degraded ? <p className="warning">当前为降级草案：{routeCard.degradedReason}</p> : null}
      </div>
    </article>
  );
}
