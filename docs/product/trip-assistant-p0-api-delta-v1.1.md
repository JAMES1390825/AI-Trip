# Trip Assistant P0 API 增量契约 v1.1（Frozen Baseline）
更新时间：2026-03-21
状态：Frozen for Integration
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)

---

## 1. 设计原则

- 兼容现有客户端：不破坏已有字段与已有路由。
- 新能力优先以“可选字段 + 新接口”扩展。
- 错误格式统一：`{ error, message, timestamp }`。
- `v1.1` 为前后端联调唯一基线，后续变更需记录在文档尾部变更记录。

---

## 2. 鉴权边界（冻结）

- 需要 Bearer 鉴权：
- `/api/v1/plans/saved/**` 下所有新增接口（tasks/diff/share）。

- 无需鉴权（匿名只读）：
- `GET /api/v1/share/{token}`。

---

## 3. 增量能力一览（冻结）

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

## 4. 详细契约（冻结）

## 4.1 生成（扩展：多方案）

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

字段规则（冻结）：

- `variants` 可选，允许值：`1 | 2`。
- 不传 `variants`：保持旧行为（返回单 itinerary 对象）。
- 传 `variants`（即使是 `1`）：统一返回对象形状 `{ plans, degraded }`。

### 响应（冻结）

1. 未传 `variants`（兼容旧客户端）

```json
{
  "request_id": "req-xxx",
  "destination": "beijing",
  "days": []
}
```

2. 传 `variants`（新客户端）

```json
{
  "plans": [
    { "plan_variant": "balanced", "itinerary": {} },
    { "plan_variant": "experience", "itinerary": {} }
  ],
  "degraded": false
}
```

`plan_variant` 枚举（P0）：`balanced | experience`。

---

## 4.2 出发前清单

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

语义（冻结）：

- `PUT` 采用“全量替换”。
- `status` 枚举固定为：`todo | done | skipped`。
- `tasks` 建议上限：每计划 <= 100 项。

响应：返回更新后的任务数组。

---

## 4.3 版本差异

`GET /api/v1/plans/saved/{id}/diff?from_version=2&to_version=5`

参数规则（冻结）：

- `from_version` 必填，正整数。
- `to_version` 必填，正整数。
- 不允许 `from_version == to_version`。

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

字段约束（冻结）：

- `items[]` 至少包含：`block_id` 或（`day_index + start_hour + end_hour`）定位信息。

---

## 4.4 分享能力

### 创建分享

`POST /api/v1/plans/saved/{id}/share`

请求：

```json
{
  "expires_in_hours": 168
}
```

字段规则（冻结）：

- `expires_in_hours` 取值范围：`1 ~ 720`。
- 默认值：`168`（7 天）。

响应（冻结）：

```json
{
  "token": "shr_xxxxx",
  "share_path": "/share/shr_xxxxx",
  "expires_at": "2026-03-28T12:00:00Z"
}
```

> 说明：前端自行拼接域名，不返回绝对 `share_url`。

### 关闭分享

`DELETE /api/v1/plans/saved/{id}/share/{token}`

响应：`204 No Content`

错误：

- token 不存在或已关闭：`404 NOT_FOUND`

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

安全要求（冻结）：

- 响应需做最小脱敏（不返回 `request_snapshot.user_id` 等敏感用户标识）。

---

## 4.5 诊断字段（itinerary 增量）

诊断归属（冻结）：

- 后端只返回“数据侧诊断”。
- 前端本地诊断（Key 缺失、SDK 加载失败、白名单问题）由前端自行计算，不纳入后端契约。

后端 diagnostics 示例：

```json
{
  "diagnostics": [
    {
      "code": "DEST_COORD_MISMATCH",
      "level": "warn",
      "message": "目的地与坐标聚类城市可能不一致",
      "action": "regenerate_or_replan"
    },
    {
      "code": "LONG_TRANSIT_DAY",
      "level": "warn",
      "message": "当天通勤时间偏长",
      "action": "replan_window"
    },
    {
      "code": "WINDOW_ALL_LOCKED",
      "level": "info",
      "message": "窗口内全部为锁定时段",
      "action": "unlock_or_change_window"
    }
  ]
}
```

---

## 5. 错误码（冻结）

| error | message 示例 |
|---|---|
| BAD_REQUEST | `variants must be 1 or 2` |
| BAD_REQUEST | `from_version and to_version are required` |
| BAD_REQUEST | `invalid task status: archived` |
| NOT_FOUND | `saved plan not found` |
| NOT_FOUND | `share token not found` |
| FORBIDDEN | `cannot update tasks of other user plan` |
| GONE | `share token expired` |
| INTERNAL_ERROR | `failed to persist shared token` |

---

## 6. 兼容性说明（冻结）

- 不传 `variants` 时，`/generate` 行为与当前完全一致。
- 新增字段均为可选，旧客户端可忽略。
- 新增路由不会改变现有路由优先级与鉴权流程。

---

## 7. 联调顺序（冻结）

1. `POST /plans/generate`（`variants=2`）
2. `GET/PUT /plans/saved/{id}/tasks`
3. `GET /plans/saved/{id}/diff`
4. `POST/DELETE /plans/saved/{id}/share*`
5. `GET /share/{token}`
6. `itinerary.diagnostics` 字段联调

---

## 8. 变更记录

- v1.1（2026-03-21）
- 冻结 A：多方案返回形状（传 variants 统一对象返回）
- 冻结 B：diff 参数改为 `from_version/to_version`
- 冻结 C：分享返回 `share_path` 替代绝对 URL
- 冻结 D：诊断字段归属拆分（后端数据诊断 / 前端本地诊断）

