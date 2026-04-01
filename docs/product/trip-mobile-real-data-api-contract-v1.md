# AI Trip 移动端真实数据规划 API 契约 v1
更新时间：2026-03-31  
状态：Draft for Cross-team Review  
关联系统蓝图：[trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)  
关联架构：[trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)  
关联线框：[trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)  
关联任务：[trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)

---

## 1. 文档目标

本文件定义“真实数据驱动 + 模型后置 + 抗幻觉校验”版本的移动端规划 API 契约，作为客户端、后端和联调的共同基线。

目标：

1. 明确哪些新接口需要新增，哪些旧接口需要兼容保留。
2. 冻结关键数据模型，避免客户端和后端各自演化导致返工。
3. 将“真实来源、证据、可信度、校验结果”纳入正式响应结构。
4. 明确错误和降级语义，避免用假成功掩盖真实失败。

---

## 2. 设计原则

### 2.1 兼容优先

1. 现有 `/api/v1/plans/generate` 不立即移除。
2. 新真实数据能力通过新接口或新版本路由提供。
3. 客户端可按能力逐步切换。

### 2.2 事实优先

正式 itinerary 中的点位、坐标、路线时长、天气和营业信息必须有来源。

### 2.3 可降级但不伪装

系统允许降级，但必须显式返回：

1. `degraded`
2. `source_mode`
3. `validation_result`

不能在缺乏真实事实时仍伪装成完整正式路线。

### 2.4 模型输出必须结构化

任何模型参与的结果都不得以自由文本直接入正式结构，必须经过 schema 化和校验。

---

## 3. 通用约定

### 3.1 Base URL

- 本地默认：`http://127.0.0.1:8080`
- API 前缀：`/api/v1`

### 3.2 鉴权

以下接口默认需要 Bearer token：

1. `GET /api/v1/destinations/resolve`
2. `POST /api/v1/plans/brief`
3. `POST /api/v1/plans/generate-v2`
4. `POST /api/v1/plans/validate`
5. `GET /api/v1/places/{provider}/{place_id}`

### 3.3 Content-Type

- 请求：`application/json`
- 响应：`application/json; charset=utf-8`

### 3.4 统一错误响应

```json
{
  "error": "PROVIDER_UPSTREAM_ERROR",
  "message": "amap search failed",
  "retryable": true,
  "timestamp": "2026-03-31T08:22:15Z",
  "details": {
    "provider": "amap",
    "stage": "poi_search"
  }
}
```

字段说明：

- `error`: 稳定错误码
- `message`: 给客户端和日志读的可读描述
- `retryable`: 是否建议客户端重试
- `timestamp`: ISO 时间
- `details`: 可选上下文

### 3.5 本期错误码枚举

- `BAD_REQUEST`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `INVALID_DESTINATION`
- `BRIEF_INCOMPLETE`
- `PROVIDER_TIMEOUT`
- `PROVIDER_UPSTREAM_ERROR`
- `NO_PROVIDER_RESULTS`
- `ROUTE_EVIDENCE_MISSING`
- `VALIDATION_FAILED`
- `INTERNAL_ERROR`

---

## 4. 数据模型（冻结候选）

## 4.1 DestinationEntity

```json
{
  "destination_id": "amap:310000",
  "destination_label": "上海市",
  "country": "中国",
  "region": "上海",
  "adcode": "310000",
  "city_code": "021",
  "center_lat": 31.2304,
  "center_lng": 121.4737,
  "provider": "amap",
  "provider_place_id": "B00155...",
  "match_type": "city"
}
```

字段说明：

- `destination_id`: 平台内稳定 ID，格式建议 `provider:provider_place_id|adcode`
- `destination_label`: 展示名
- `provider_place_id`: 上游 provider 原始 ID
- `match_type`: `city | district | poi | custom`

## 4.2 PlanningBrief

```json
{
  "origin_city": "上海",
  "destination": {
    "destination_id": "amap:310000",
    "destination_label": "上海市",
    "adcode": "310000",
    "center_lat": 31.2304,
    "center_lng": 121.4737,
    "provider": "amap"
  },
  "days": 3,
  "start_date": "2026-04-16",
  "budget_level": "medium",
  "pace": "relaxed",
  "travel_styles": ["citywalk", "美食"],
  "must_go": ["外滩"],
  "avoid": ["纯远郊"],
  "constraints": {
    "weather_preference": "rain_friendly",
    "dining_preference": "local_food",
    "lodging_anchor": null
  },
  "missing_fields": [],
  "ready_to_generate": true
}
```

说明：

- `PlanningBrief` 是正式生成链路的唯一输入基线。
- 客户端 UI 表单和聊天补全最终都应汇聚为该结构。

## 4.3 PlaceCandidate

```json
{
  "provider": "amap",
  "provider_place_id": "B0FF123",
  "name": "外滩",
  "category": "sight",
  "subcategory": "landmark",
  "lat": 31.24,
  "lng": 121.49,
  "address": "上海市黄浦区...",
  "rating": 4.6,
  "price_level": 2,
  "opening_hours_text": "09:00-21:00",
  "indoor_capable": false,
  "tags": ["地标", "夜景", "citywalk"],
  "source_fetched_at": "2026-03-31T12:00:00Z"
}
```

## 4.4 Evidence 对象

### 4.4.1 PlaceEvidence

```json
{
  "provider": "amap",
  "provider_place_id": "B0FF123",
  "source_mode": "provider",
  "source_fetched_at": "2026-03-31T12:00:00Z"
}
```

### 4.4.2 RouteLegEvidence

```json
{
  "from_provider_place_id": "B0FF111",
  "to_provider_place_id": "B0FF222",
  "minutes": 16,
  "distance_meters": 2480,
  "mode": "walking",
  "provider": "amap",
  "source_fetched_at": "2026-03-31T12:00:03Z"
}
```

### 4.4.3 WeatherEvidence

```json
{
  "provider": "amap",
  "adcode": "310000",
  "date": "2026-04-16",
  "condition": "light_rain",
  "high_temp": 21,
  "low_temp": 16,
  "source_fetched_at": "2026-03-31T12:00:04Z"
}
```

## 4.5 ValidationResult

```json
{
  "passed": true,
  "confidence_tier": "high",
  "issues": [],
  "coverage": {
    "provider_grounded_blocks": 1.0,
    "route_evidence_coverage": 1.0,
    "weather_evidence_coverage": 1.0,
    "must_go_hit_rate": 1.0
  }
}
```

`confidence_tier` 枚举：

- `high`
- `medium`
- `needs_confirmation`

## 4.6 ItineraryBlock v2

```json
{
  "block_id": "d1-09-11-001",
  "day_index": 0,
  "start_hour": 9,
  "end_hour": 11,
  "block_type": "sight",
  "poi": "外滩",
  "title": "上午主游",
  "recommend_reason": "已按 citywalk 偏好优先选择核心地标，并兼顾上午光线与步行串联。",
  "risk_level": "low",
  "weather_risk": "",
  "locked": false,
  "poi_lat": 31.24,
  "poi_lon": 121.49,
  "poi_map_url": "https://...",
  "provider": "amap",
  "provider_place_id": "B0FF123",
  "source_mode": "provider",
  "source_fetched_at": "2026-03-31T12:00:00Z",
  "evidence": {
    "place": {
      "provider": "amap",
      "provider_place_id": "B0FF123",
      "source_mode": "provider",
      "source_fetched_at": "2026-03-31T12:00:00Z"
    },
    "route_from_prev": null,
    "weather": {
      "provider": "amap",
      "adcode": "310000",
      "date": "2026-04-16",
      "condition": "light_rain",
      "high_temp": 21,
      "low_temp": 16,
      "source_fetched_at": "2026-03-31T12:00:04Z"
    },
    "score_breakdown": {
      "style_fit": 0.88,
      "distance_fit": 0.91,
      "weather_fit": 0.82,
      "budget_fit": 0.76
    }
  },
  "alternatives": []
}
```

---

## 5. 接口一：目的地标准化

### 5.1 Endpoint

- `GET /api/v1/destinations/resolve?q=<query>&limit=10`

### 5.2 目标

将用户自由输入标准化为结构化城市或行政区候选，用于后续规划锚点确认。

### 5.3 请求参数

- `q`: 必填，用户输入
- `limit`: 可选，默认 `10`，最大 `20`
- `locale`: 可选，默认 `zh-CN`

### 5.4 成功响应

```json
{
  "items": [
    {
      "destination_id": "amap:310000",
      "destination_label": "上海市",
      "country": "中国",
      "region": "上海",
      "adcode": "310000",
      "city_code": "021",
      "center_lat": 31.2304,
      "center_lng": 121.4737,
      "provider": "amap",
      "provider_place_id": "B00155...",
      "match_type": "city"
    }
  ],
  "degraded": false
}
```

### 5.5 降级响应

当 provider 无结果但允许用户继续时：

```json
{
  "items": [
    {
      "destination_id": "custom:上海迪士尼附近",
      "destination_label": "上海迪士尼附近",
      "country": "",
      "region": "",
      "adcode": "",
      "city_code": "",
      "center_lat": 0,
      "center_lng": 0,
      "provider": "custom",
      "provider_place_id": "",
      "match_type": "custom"
    }
  ],
  "degraded": true
}
```

说明：

- `custom` 结果仅用于下一步澄清，不允许直接进入正式生成链路。

---

## 6. 接口二：规划 brief 结构化

### 6.1 Endpoint

- `POST /api/v1/plans/brief`

### 6.2 目标

将 AI 规划页表单输入和自然语言补充统一整理为标准化 `PlanningBrief`。

### 6.3 请求体

```json
{
  "origin_city": "上海",
  "destination_text": "上海",
  "selected_destination": {
    "destination_id": "amap:310000",
    "destination_label": "上海市",
    "adcode": "310000",
    "center_lat": 31.2304,
    "center_lng": 121.4737,
    "provider": "amap"
  },
  "days": 3,
  "start_date": "2026-04-16",
  "budget_level": "medium",
  "pace": "relaxed",
  "travel_styles": ["citywalk", "美食"],
  "must_go": ["外滩"],
  "avoid": ["纯远郊"],
  "free_text": "雨天也能执行，尽量多一点本地餐馆"
}
```

### 6.4 成功响应

```json
{
  "planning_brief": {
    "origin_city": "上海",
    "destination": {
      "destination_id": "amap:310000",
      "destination_label": "上海市",
      "adcode": "310000",
      "center_lat": 31.2304,
      "center_lng": 121.4737,
      "provider": "amap"
    },
    "days": 3,
    "start_date": "2026-04-16",
    "budget_level": "medium",
    "pace": "relaxed",
    "travel_styles": ["citywalk", "美食"],
    "must_go": ["外滩"],
    "avoid": ["纯远郊"],
    "constraints": {
      "weather_preference": "rain_friendly",
      "dining_preference": "local_food",
      "lodging_anchor": null
    },
    "missing_fields": [],
    "ready_to_generate": true
  },
  "assistant_message": "已理解你的核心偏好，可以开始生成真实路线。",
  "degraded": false
}
```

### 6.5 失败 / 不完整

当 destination 未标准化或关键信息不足时，不应直接报硬错，优先返回澄清结果：

```json
{
  "planning_brief": {
    "origin_city": "上海",
    "destination": null,
    "days": 3,
    "start_date": "2026-04-16",
    "budget_level": "medium",
    "pace": "relaxed",
    "travel_styles": ["citywalk"],
    "must_go": [],
    "avoid": [],
    "constraints": {},
    "missing_fields": ["destination"],
    "ready_to_generate": false
  },
  "assistant_message": "我还需要你先确认目的地城市。",
  "next_action": "CONFIRM_DESTINATION",
  "degraded": true
}
```

---

## 7. 接口三：真实数据生成

### 7.1 Endpoint

- `POST /api/v1/plans/generate-v2`

### 7.2 目标

基于结构化 `PlanningBrief`、真实 provider 数据和规则排程生成正式 itinerary。

### 7.3 请求体

```json
{
  "planning_brief": {
    "origin_city": "上海",
    "destination": {
      "destination_id": "amap:310000",
      "destination_label": "上海市",
      "adcode": "310000",
      "center_lat": 31.2304,
      "center_lng": 121.4737,
      "provider": "amap"
    },
    "days": 3,
    "start_date": "2026-04-16",
    "budget_level": "medium",
    "pace": "relaxed",
    "travel_styles": ["citywalk", "美食"],
    "must_go": ["外滩"],
    "avoid": ["纯远郊"],
    "constraints": {
      "weather_preference": "rain_friendly",
      "dining_preference": "local_food",
      "lodging_anchor": null
    }
  },
  "options": {
    "variants": 1,
    "allow_fallback": true,
    "include_candidate_debug": false
  }
}
```

### 7.4 字段规则

- `planning_brief.destination` 必填，且必须是结构化对象
- `variants` 当前允许 `1 | 2`
- `allow_fallback` 默认 `true`
- 若 `allow_fallback = false` 且真实 provider 事实不足，应直接返回错误或待确认态

### 7.5 成功响应

```json
{
  "plans": [
    {
      "plan_variant": "balanced",
      "itinerary": {
        "request_id": "req-20260331-001",
        "destination": "上海市",
        "start_date": "2026-04-16",
        "granularity": "hourly",
        "map_provider": "amap",
        "version": 1,
        "source_mode": "provider",
        "degraded": false,
        "confidence": 0.89,
        "validation_result": {
          "passed": true,
          "confidence_tier": "high",
          "issues": [],
          "coverage": {
            "provider_grounded_blocks": 1.0,
            "route_evidence_coverage": 1.0,
            "weather_evidence_coverage": 1.0,
            "must_go_hit_rate": 1.0
          }
        },
        "days": [],
        "day_summaries": [],
        "today_hint": {},
        "warnings": [],
        "request_snapshot": {}
      }
    }
  ],
  "degraded": false
}
```

### 7.6 降级响应

当真实结果不够完整，但仍允许返回“待确认草案”时：

```json
{
  "plans": [
    {
      "plan_variant": "balanced",
      "itinerary": {
        "request_id": "req-20260331-002",
        "destination": "上海市",
        "start_date": "2026-04-16",
        "map_provider": "amap",
        "source_mode": "fallback",
        "degraded": true,
        "confidence": 0.54,
        "validation_result": {
          "passed": false,
          "confidence_tier": "needs_confirmation",
          "issues": [
            {
              "code": "PROVIDER_COVERAGE_LOW",
              "message": "部分时段候选不足"
            }
          ],
          "coverage": {
            "provider_grounded_blocks": 0.5,
            "route_evidence_coverage": 0.4,
            "weather_evidence_coverage": 1.0,
            "must_go_hit_rate": 0.0
          }
        },
        "days": [],
        "warnings": ["真实候选覆盖不足，当前为待确认草案"]
      }
    }
  ],
  "degraded": true
}
```

### 7.7 不应返回“假成功”的场景

以下情况若 `allow_fallback = false`，应直接失败：

1. 目的地未标准化
2. provider 调用失败且无缓存
3. block 级来源缺失
4. route evidence 覆盖率低于阈值
5. validation_result 未通过

---

## 8. 接口四：独立校验

### 8.1 Endpoint

- `POST /api/v1/plans/validate`

### 8.2 目标

对已生成 itinerary 或用户编辑后的 itinerary 做独立校验，用于保存前、分享前和客户端二次确认。

### 8.3 请求体

```json
{
  "itinerary": {
    "destination": "上海市",
    "days": []
  },
  "strict": true
}
```

### 8.4 成功响应

```json
{
  "validation_result": {
    "passed": true,
    "confidence_tier": "high",
    "issues": [],
    "coverage": {
      "provider_grounded_blocks": 1.0,
      "route_evidence_coverage": 1.0,
      "weather_evidence_coverage": 1.0,
      "must_go_hit_rate": 1.0
    }
  }
}
```

### 8.5 失败响应

```json
{
  "validation_result": {
    "passed": false,
    "confidence_tier": "needs_confirmation",
    "issues": [
      {
        "code": "BLOCK_SOURCE_MISSING",
        "message": "day 1 block 2 缺少 provider_place_id"
      },
      {
        "code": "ROUTE_GAP",
        "message": "外滩 -> 武康路 缺少路线证据"
      }
    ],
    "coverage": {
      "provider_grounded_blocks": 0.75,
      "route_evidence_coverage": 0.5,
      "weather_evidence_coverage": 1.0,
      "must_go_hit_rate": 1.0
    }
  }
}
```

---

## 9. 接口五：点位详情

### 9.1 Endpoint

- `GET /api/v1/places/{provider}/{place_id}`

### 9.2 目标

为点位详情页提供可验证的 provider 详情数据。

### 9.3 成功响应

```json
{
  "provider": "amap",
  "provider_place_id": "B0FF123",
  "name": "外滩",
  "address": "上海市黄浦区...",
  "lat": 31.24,
  "lng": 121.49,
  "rating": 4.6,
  "price_level": 2,
  "opening_hours_text": "全天开放",
  "phone": "",
  "images": [],
  "tags": ["地标", "夜景", "citywalk"],
  "source_fetched_at": "2026-03-31T12:00:00Z"
}
```

---

## 10. 与旧接口的兼容关系

### 10.1 保留

以下接口继续保留：

1. `POST /api/v1/plans/generate`
2. `POST /api/v1/plans/replan`
3. `POST /api/v1/plans/save`
4. `GET /api/v1/plans/saved`
5. `GET /api/v1/plans/saved/{id}`

### 10.2 建议迁移顺序

1. 客户端先切 `destinations/resolve`
2. 再切 `plans/brief`
3. 再切 `plans/generate-v2`
4. 保存前增加 `plans/validate`

### 10.3 废弃策略

旧 `/plans/generate` 不立即下线，但应标记为：

`source_mode = rules_legacy`

方便客户端区分新旧链路。

---

## 11. 错误与降级语义

### 11.1 何时返回 HTTP 错误

适合直接返回 4xx / 5xx 的情况：

1. 请求结构非法
2. 目的地缺失
3. 日期非法
4. provider 请求超时且不允许 fallback
5. 校验强制失败

### 11.2 何时返回 200 + degraded

适合返回 200 的情况：

1. 已拿到部分真实数据
2. 能提供“待确认草案”
3. 客户端仍可继续人工调整

### 11.3 降级字段

建议在相关接口统一返回：

```json
{
  "degraded": true,
  "degraded_reason": "provider_coverage_low"
}
```

`degraded_reason` 枚举建议：

- `provider_timeout`
- `provider_coverage_low`
- `route_evidence_partial`
- `weather_evidence_partial`
- `destination_custom_unresolved`
- `validation_not_passed`

---

## 12. 联调检查点

### L1：目的地标准化

检查项：

1. `destination_id`
2. `adcode`
3. `center_lat/lng`
4. `provider`

### L2：Brief 结构化

检查项：

1. 表单和自然语言是否汇总到同一 `PlanningBrief`
2. `missing_fields` 和 `ready_to_generate` 是否准确

### L3：真实数据生成

检查项：

1. 每个 block 是否都有 `provider_place_id`
2. 相邻 block 是否有 route evidence
3. 天气 evidence 是否正确挂入

### L4：校验和可信度

检查项：

1. `validation_result` 是否稳定
2. `confidence_tier` 是否与 coverage 对齐

---

## 13. 建议实施顺序

1. 先实现 `GET /destinations/resolve`
2. 再实现 `POST /plans/brief`
3. 再实现 `POST /plans/generate-v2`
4. 最后补 `POST /plans/validate` 和 `GET /places/{provider}/{place_id}`

原因：

1. 先把输入锚点和规划 brief 定住
2. 再做主生成链路
3. 最后补校验和详情增强

---

## 14. 结论

这份 API 契约的核心不是新增多少路由，而是冻结一条新的事实链路：

1. 目的地要结构化
2. 点位要有 provider 来源
3. 路线和天气要有 evidence
4. 结果要有 `validation_result`
5. 降级必须显式

只要这 5 点守住，后续接真实 provider、接模型解释、接客户端地图执行都会稳定得多。
