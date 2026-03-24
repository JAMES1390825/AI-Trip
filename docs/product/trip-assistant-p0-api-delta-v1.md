# Trip Assistant P0 API 增量契约 v1
更新时间：2026-03-21
状态：Draft for Integration
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)

---

## 1. 设计原则

- 兼容现有客户端：不破坏已有字段与已有路由。
- 新能力优先以“可选字段 + 新接口”扩展。
- 错误格式沿用统一结构：`{ error, message, timestamp }`。

---

## 2. 增量能力一览

| 能力 | 路由 | 方法 |
|---|---|---|
| 多方案生成 | `/api/v1/plans/generate` | POST（扩展） |
| 清单读取 | `/api/v1/plans/saved/{id}/tasks` | GET |
| 清单更新 | `/api/v1/plans/saved/{id}/tasks` | PUT |
| 版本差异 | `/api/v1/plans/saved/{id}/diff` | GET |
| 创建分享 | `/api/v1/plans/saved/{id}/share` | POST |
| 关闭分享 | `/api/v1/plans/saved/{id}/share/{token}` | DELETE |
| 分享只读 | `/api/v1/share/{token}` | GET（无鉴权） |

---

## 3. 详细契约

## 3.1 生成（扩展：多方案）

### 请求

`POST /api/v1/plans/generate`

兼容旧请求体，新增可选字段：

```json
{
  "origin_city": "shanghai",
  "destination": "beijing",
  "days": 3,
  "budget_level": "medium",
  "start_date": "2026-04-02",
  "pace": "relaxed",
  "variants": 2
}
```

说明：

- `variants` 可选，P0 仅支持 `1|2`，默认 `1`。

### 响应

`variants=1`：保持现有 itinerary 结构。  
`variants=2`：返回数组，包含两套方案。

```json
{
  "plans": [
    { "plan_variant": "balanced", "itinerary": {} },
    { "plan_variant": "experience", "itinerary": {} }
  ],
  "degraded": false
}
```

---

## 3.2 出发前清单

### 读取

`GET /api/v1/plans/saved/{id}/tasks`

响应：

```json
[
  {
    "id": "task-001",
    "category": "booking",
    "title": "预约故宫门票",
    "due_at": "2026-04-01T12:00:00Z",
    "status": "todo"
  }
]
```

### 更新

`PUT /api/v1/plans/saved/{id}/tasks`

请求：

```json
{
  "tasks": [
    {
      "id": "task-001",
      "category": "booking",
      "title": "预约故宫门票",
      "due_at": "2026-04-01T12:00:00Z",
      "status": "done"
    }
  ]
}
```

响应：返回更新后的任务数组。

---

## 3.3 版本差异

`GET /api/v1/plans/saved/{id}/diff?from=2&to=5`

响应：

```json
{
  "from_version": 2,
  "to_version": 5,
  "summary": {
    "changed_blocks": 4,
    "changed_days": [0, 1],
    "change_types": ["replan_window", "lock"]
  },
  "items": [
    {
      "day_index": 0,
      "block_id": "d1-09-11-01",
      "start_hour": 9,
      "end_hour": 11,
      "old": { "poi": "故宫", "locked": false },
      "new": { "poi": "什刹海", "locked": true }
    }
  ]
}
```

---

## 3.4 分享能力

### 创建分享

`POST /api/v1/plans/saved/{id}/share`

请求：

```json
{
  "expires_in_hours": 168
}
```

响应：

```json
{
  "token": "shr_xxxxx",
  "share_url": "http://127.0.0.1:5500/share/shr_xxxxx",
  "expires_at": "2026-03-28T12:00:00Z"
}
```

### 关闭分享

`DELETE /api/v1/plans/saved/{id}/share/{token}`

响应：`204 No Content`

### 分享只读访问

`GET /api/v1/share/{token}`

响应：

```json
{
  "id": "plan-123",
  "itinerary": {},
  "readonly": true,
  "shared_at": "2026-03-21T12:00:00Z"
}
```

---

## 3.5 诊断字段（itinerary 增量）

在 itinerary 顶层新增可选字段：

```json
{
  "diagnostics": [
    {
      "code": "MAP_KEY_MISSING",
      "level": "warn",
      "message": "未配置高德 JS Key",
      "action": "goto_settings"
    }
  ]
}
```

---

## 4. 错误码补充建议

| error | message 示例 |
|---|---|
| BAD_REQUEST | `variants must be 1 or 2` |
| BAD_REQUEST | `diff query requires from and to` |
| NOT_FOUND | `share token not found` |
| FORBIDDEN | `cannot update tasks of other user plan` |
| GONE | `share token expired` |

---

## 5. 兼容性说明

- 不传 `variants` 时，`/generate` 行为与当前完全一致。
- 新增字段均为可选，旧客户端可忽略。
- 分享只读路由不影响现有鉴权模型。

---

## 6. 联调建议顺序

1. `generate(variants=2)`
2. `tasks GET/PUT`
3. `diff GET`
4. `share POST/GET/DELETE`
5. `diagnostics` 字段补齐


---

## 7. API 评审决议（2026-03-21）

本节为联调前冻结建议，优先解决实现歧义。

### 7.1 已确认（建议直接冻结）

1. 鉴权边界
- `/api/v1/plans/saved/**` 新增接口全部需要 Bearer 鉴权。
- `/api/v1/share/{token}` 为匿名只读访问，无需鉴权。

2. 清单更新语义
- `PUT /api/v1/plans/saved/{id}/tasks` 采用“全量替换”语义。
- `status` 枚举固定为：`todo|done|skipped`。

3. 分享关闭语义
- `DELETE /api/v1/plans/saved/{id}/share/{token}` 成功返回 `204`。
- 已关闭或不存在 token 返回 `404 NOT_FOUND`。

4. 错误格式
- 统一维持：`{ error, message, timestamp }`。

### 7.2 需冻结的关键调整（高优先）

#### A. 多方案返回形状（避免前端分支复杂）

问题：当前草案对 `/plans/generate` 是“单方案返回 itinerary，多方案返回 object”，前端会出现双形状解析。

建议冻结：

- 不传 `variants`：保持旧行为（直接 itinerary，兼容旧客户端）。
- 传 `variants`（即使值为 1）：统一返回对象形状：

```json
{
  "plans": [
    { "plan_variant": "balanced", "itinerary": {} }
  ],
  "degraded": false
}
```

这样新前端只需按“是否传 variants”决定解析分支。

#### B. diff 查询参数命名

问题：`from/to` 语义偏弱，日志与埋点不易读。

建议冻结：

- 改为：`from_version`、`to_version`
- 路由：`GET /api/v1/plans/saved/{id}/diff?from_version=2&to_version=5`

#### C. 分享返回字段

问题：后端返回绝对 `share_url` 可能依赖环境域名，易错。

建议冻结：

- 返回 `token` + `share_path`，由前端拼接最终 URL。

```json
{
  "token": "shr_xxxxx",
  "share_path": "/share/shr_xxxxx",
  "expires_at": "2026-03-28T12:00:00Z"
}
```

#### D. 诊断字段归属

问题：`MAP_KEY_MISSING` 这类诊断属于前端本地配置，不应由后端产出。

建议冻结：

- 后端 `diagnostics` 仅返回“数据侧诊断”：
- `DEST_COORD_MISMATCH`
- `LONG_TRANSIT_DAY`
- `WINDOW_ALL_LOCKED`

- 前端本地诊断（key/SDK/白名单）由 Web 自行生成并展示，不入后端契约。

### 7.3 建议补充字段约束

1. `plan_variant` 枚举：`balanced|experience`（P0）
2. `expires_in_hours` 范围：`1~720`，默认 `168`
3. `diff` 返回项字段：`day_index/block_id/start_hour/end_hour/old/new` 全部可选但至少含 `block_id` 或时间窗定位信息
4. `tasks` 数组建议上限：每计划 <= 100 项

### 7.4 建议错误码补充

| error | 场景 |
|---|---|
| BAD_REQUEST | `variants must be 1 or 2` |
| BAD_REQUEST | `from_version and to_version are required` |
| NOT_FOUND | `share token not found` |
| GONE | `share token expired` |
| FORBIDDEN | `cannot update tasks of other user plan` |

### 7.5 联调冻结版本建议

- 当前文档可作为 `v1`。
- 完成 A/B/C/D 四项冻结后，建议发 `v1.1` 给前后端并作为唯一联调基线。

