# Alert Runbook (V1)

This runbook maps Prometheus alerts to first-response actions.

> Note: In current single-machine mode, Prometheus scraping is disabled by default.
> Re-enable alert rules only after `trip-api` exposes a Prometheus-compatible metrics endpoint.

## Active Rule File

- `infra/monitoring/alerts/trip-alerts.yml`

## Alerts

### `TripApiHigh5xxRate`

- Trigger: 5xx ratio > 5% for 10m.
- First checks:
  - `trip-api` process logs
  - `trip-api` recent API/event trends (`/api/v1/events/summary` for admin)
  - current environment variable changes (JWT/CORS/bootstrap secret)
- Mitigation:
  - Roll back recent deployment
  - Temporarily route traffic to stable build

### `TripPlanGenerationFailureRateHigh`

- Trigger: generation failure ratio > 10% for 10m.
- First checks:
  - `trip_plan_generated_total{status="failure"}`
  - `trip-api` logs around `/api/v1/plans/generate` request validation and generation flow
- Mitigation:
  - validate request payload quality and retry with safer defaults
  - verify service health endpoint and recent deploy/config changes

### `TripPlanGenerationP95LatencyHigh`

- Trigger: p95 generation latency > 8s for 10m.
- First checks:
  - `trip_plan_generate_latency_seconds_*`
  - generation request volume spikes and payload complexity
  - external provider response time
- Mitigation:
  - reduce expensive option combinations for peak traffic windows
  - Reduce provider timeout and fall back faster

### `TripPlanCacheHitRateLow`

- Trigger: cache hit ratio < 15% for 30m.
- First checks:
  - `trip_plan_cache_total{result="hit|miss"}`
  - cache key cardinality and event payload consistency
- Mitigation:
  - Increase cache TTL
  - Normalize request keys to avoid key explosion

### `TripReplanFailureRateHigh`

- Trigger: replan failure ratio > 20% for 15m.
- First checks:
  - `trip_plan_replan_applied_total{status="failure"}`
  - request payload integrity (affected_days, locked blocks)
- Mitigation:
  - Fallback to full replan for impacted users
  - disable problematic patch type in feature flags
