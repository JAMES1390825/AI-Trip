# V1 KPI Definition

## Core Metrics

1. Plan generation success rate
- Formula: `plan_generated(success=true) / plan_requested`
- Target: `>= 90%`

2. Day-0 save rate
- Formula: users with at least one `plan_saved` on first generation day / users with `plan_generated`
- Target: `>= 50%`

3. Partial replan success rate
- Formula: `replan_applied(success=true) / replan_triggered`
- Target: `>= 95%`

4. Planning latency P95
- Formula: P95 of end-to-end generate API latency
- Target: `<= 8s`

5. W4 retention
- Formula: cohort return in week 4
- Target: `>= 20%`

## Event Names

- `plan_requested`
- `plan_generated`
- `plan_saved`
- `replan_triggered`
- `replan_applied`
- `plan_exported`
- `weekly_returned`
- `plan_feedback_submitted`
