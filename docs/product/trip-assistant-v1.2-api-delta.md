# Trip Assistant API 增量契约 v1.2（N1-N4）
更新时间：2026-03-22
状态：Frozen for Integration
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)
基线版本：[trip-assistant-p0-api-delta-v1.1.md](./trip-assistant-p0-api-delta-v1.1.md)

---

## 1. 目标与范围

本契约用于承接 v1.2 P1 新需求（N1-N4）：

- N1 分享页只读地图
- N2 风险提醒增强（可执行动作）
- N3 出发前清单提醒闭环
- N4 今天模式执行状态（完成/跳过）

范围原则：

- 与 v1.1 完全兼容，不破坏现有路由与字段。
- v1.2 优先采用“可选字段 + 新接口”扩展。
- 所有新增字段默认可缺省，旧客户端可忽略。

---

## 2. 鉴权边界（v1.2）

- Bearer 鉴权：
- `/api/v1/plans/saved/**` 下新增/扩展接口（含 execution）。

- 匿名只读：
- `GET /api/v1/share/{token}`（保持不变）。

---

## 3. 路由增量总览

| 能力 | 路由 | 方法 | 类型 |
|---|---|---|---|
| 分享只读地图数据保障 | `/api/v1/share/{token}` | GET（扩展） | 字段扩展 |
| 风险提醒动作化 | 生成/重排/读取行程相关接口 | GET/POST（扩展） | 字段扩展 |
| 清单提醒字段 | `/api/v1/plans/saved/{id}/tasks` | GET/PUT（扩展） | 字段扩展 |
| 执行状态持久化 | `/api/v1/plans/saved/{id}/execution` | GET/PUT（新增） | 新路由 |

---

## 4. 详细契约

## 4.1 N1 分享页只读地图（扩展）

### 路由

`GET /api/v1/share/{token}`

### 扩展约束

- 响应中 `itinerary.days[].blocks[]` 若存在地图能力，需尽可能返回：
- `poi_coords: { lat, lon }`
- `poi_map_url`（可选）

- 对同一 token，响应内的点位顺序需与时间线顺序一致（按 day + start_hour + block 序）。

### 响应示例（节选）

```json
{
  "id": "plan-123",
  "readonly": true,
  "itinerary": {
    "days": [
      {
        "day_index": 0,
        "blocks": [
          {
            "start_hour": 9,
            "end_hour": 11,
            "poi": "故宫",
            "poi_coords": { "lat": 39.9163, "lon": 116.3972 },
            "poi_map_url": "https://uri.amap.com/marker?..."
          }
        ]
      }
    ]
  }
}
```

---

## 4.2 N2 风险提醒增强（扩展）

### 生效接口

以下接口返回的 `itinerary.diagnostics[]` 执行 v1.2 扩展：

- `POST /api/v1/plans/generate`
- `POST /api/v1/plans/replan`
- `GET /api/v1/plans/saved/{id}`
- `GET /api/v1/share/{token}`

### diagnostics 扩展字段

```json
{
  "code": "POI_OPEN_HOURS_MISMATCH",
  "level": "warn",
  "message": "14:00 到达时间不在营业时段内",
  "action": {
    "type": "replan_window",
    "label": "替换该时段",
    "payload": {
      "day_index": 0,
      "start_hour": 14,
      "end_hour": 16
    }
  },
  "target": {
    "day_index": 0,
    "block_id": "d1-14-16-01"
  }
}
```

### 新增 code（P1）

- `POI_CLOSED_ON_DATE`
- `POI_OPEN_HOURS_MISMATCH`
- `APPOINTMENT_DEADLINE_SOON`

### action.type 枚举（P1）

- `replan_window`
- `open_external_link`
- `add_pretrip_task`
- `noop`

兼容说明：

- `action` 与 `target` 为可选字段，旧客户端可忽略。

---

## 4.3 N3 清单提醒（扩展）

### 路由

`GET /api/v1/plans/saved/{id}/tasks`

`PUT /api/v1/plans/saved/{id}/tasks`

### tasks[] 扩展字段（可选）

```json
{
  "id": "task-001",
  "title": "预约故宫门票",
  "status": "todo",
  "due_at": "2026-04-01T12:00:00Z",
  "reminder": {
    "enabled": true,
    "offset_hours": [168, 72, 24]
  }
}
```

字段规则：

- `reminder.enabled` 默认 `true`。
- `reminder.offset_hours` 允许值集合：`[24, 48, 72, 168]`。
- 若未传 reminder，后端按默认策略返回。

兼容说明：

- 不改变 `status` 枚举，仍为 `todo | done | skipped`。

---

## 4.4 N4 今天模式执行状态（新增）

### 读取执行状态

`GET /api/v1/plans/saved/{id}/execution`

响应示例：

```json
{
  "saved_plan_id": "plan-123",
  "date": "2026-04-02",
  "summary": {
    "total": 6,
    "done": 2,
    "skipped": 1,
    "pending": 3
  },
  "blocks": [
    {
      "day_index": 0,
      "block_id": "d1-09-11-01",
      "status": "done",
      "updated_at": "2026-04-02T01:20:00Z"
    }
  ]
}
```

### 更新执行状态

`PUT /api/v1/plans/saved/{id}/execution`

请求示例：

```json
{
  "date": "2026-04-02",
  "updates": [
    {
      "day_index": 0,
      "block_id": "d1-11-13-02",
      "status": "skipped"
    }
  ]
}
```

字段规则：

- `status` 枚举：`pending | done | skipped`。
- `updates` 支持批量，建议上限 100。
- `execution` 变更不进入行程版本链（不新增 `version`）。

---

## 5. 错误码增量（v1.2）

| error | message 示例 |
|---|---|
| BAD_REQUEST | `invalid execution status: archived` |
| BAD_REQUEST | `invalid reminder offset_hours` |
| NOT_FOUND | `execution state not found` |
| FORBIDDEN | `cannot update execution of other user plan` |

---

## 6. 兼容性与迁移

- v1.1 客户端可无感继续使用。
- v1.2 新字段均可选，旧端忽略不报错。
- 新增 `/execution` 路由不影响旧路由匹配。

---

## 7. 联调顺序（建议）

1. `GET /share/{token}` 地图字段完整性（N1）
2. diagnostics 动作字段联调（N2）
3. tasks reminder 字段联调（N3）
4. `/execution` 读写联调（N4）

---

## 8. 变更记录

- v1.2-draft（2026-03-21）
- 新增 N1-N4 契约草案。
- 保持与 v1.1 完全兼容。

- v1.2（2026-03-22）
- 冻结 N1：分享只读地图字段与降级策略。
- 冻结 N2：diagnostics action/target 扩展。
- 冻结 N3：tasks reminder 可选字段规范。
- 冻结 N4：execution 独立路由与版本链解耦。
