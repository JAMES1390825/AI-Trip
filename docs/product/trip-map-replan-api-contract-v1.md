# Trip Map + Replan API Contract v1
更新时间：2026-03-19  
状态：Scope Locked (Backend Contract)  
关联 PRD：[trip-map-replan-prd-v1.md](./trip-map-replan-prd-v1.md)

---

## 1. 目标

本文件定义“地图执行视图 + 锁定/局部重排 + 版本回退”所需的后端接口契约，作为开发、联调与测试的共同基线。

本版已确认约束：

- 地图供应商固定为 Amap（高德）。
- 局部重排支持任意小时段窗口。
- 回退采用“生成新版本”策略。
- 每个行程仅保留最近 20 个版本。

---

## 2. 通用约定

### 2.1 Base URL

- 本地默认：`http://127.0.0.1:8080`
- API 前缀：`/api/v1`

### 2.2 鉴权

- 受保护接口必须携带：`Authorization: Bearer <access_token>`
- token 签发接口：`POST /api/v1/auth/token`
- token 过期或无效统一返回 `401 UNAUTHORIZED`

### 2.3 Content-Type

- 请求：`application/json`
- 响应：`application/json; charset=utf-8`

### 2.4 错误响应格式（统一）

```json
{
  "error": "BAD_REQUEST",
  "message": "itinerary and patch are required",
  "timestamp": "2026-03-19T08:31:22Z"
}
```

`error` 枚举（本期）：

- `BAD_REQUEST`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `INTERNAL_ERROR`

---

## 3. 数据模型（增量）

### 3.1 Itinerary 顶层新增字段

```json
{
  "version": 3,
  "parent_version": 2,
  "map_provider": "amap",
  "changes": [],
  "conflicts": []
}
```

字段定义：

- `version: integer >= 1` 当前版本号。
- `parent_version: integer | null` 来源版本号。
- `changes: ChangeItem[]` 本次操作产生的结构化变更。
- `conflicts: ConflictItem[]` 本次操作冲突信息。
- `map_provider` 固定返回 `"amap"`。

### 3.2 Block 新增字段

```json
{
  "block_id": "d1-09-11-001",
  "locked": false,
  "lock_reason": ""
}
```

字段定义：

- `block_id: string` 行程块稳定标识（版本间用于 diff）。
- `locked: boolean` 是否锁定。
- `lock_reason: string` 可选。

### 3.3 ChangeItem

```json
{
  "change_type": "replan_window",
  "day_index": 1,
  "block_id": "d2-14-17-002",
  "start_hour": 14,
  "end_hour": 17,
  "old_poi": "豫园",
  "new_poi": "武康路",
  "reason": "window_rebalance_food_density"
}
```

### 3.4 ConflictItem

```json
{
  "code": "WINDOW_ALL_LOCKED",
  "message": "target window contains only locked blocks",
  "day_index": 1
}
```

---

## 4. 接口一：重排（扩展）

### 4.1 Endpoint

- `POST /api/v1/plans/replan`

### 4.2 请求体

```json
{
  "itinerary": {
    "request_snapshot": {
      "user_id": "user-123"
    },
    "version": 2,
    "days": []
  },
  "patch": {
    "change_type": "replan_window",
    "targets": [
      {
        "day_index": 1,
        "start_hour": 14,
        "end_hour": 18
      }
    ],
    "keep_locked": true
  }
}
```

### 4.3 `patch` 字段定义

- `change_type` 必填，枚举：
- `lock`
- `unlock`
- `replan_window`
- `budget`
- `preferences`
- `poi`
- `date`

- `targets` 条件必填（见 4.4）。
- `keep_locked` 可选，默认 `true`。
- 兼容字段：若传入 `preserve_locked`，服务端按 `keep_locked` 处理（历史兼容）。
- `affected_days` 可选，沿用现有语义。

### 4.4 各 `change_type` 校验规则

`lock`：

- 必须有 `targets`。
- 每个 target 必须能定位唯一 block（推荐 `block_id`，兼容 `day_index+start_hour+end_hour`）。

`unlock`：

- 与 `lock` 相同。

`replan_window`：

- 必须有 `targets`，至少 1 个。
- 每个 target 要求：
- `day_index` 为有效整数且存在于行程范围。
- `start_hour`、`end_hour` 为 0-24 整数，且 `start_hour < end_hour`。

`budget`：

- `new_budget_level` 必填，枚举：`low|medium|high`。

`preferences`：

- `new_travel_styles` 必填，非空数组。

`poi`：

- `remove_poi` 必填，非空字符串。

`date`：

- `new_start_date` 必填，格式 `YYYY-MM-DD`。

### 4.5 成功响应（200）

返回更新后的完整 itinerary（保持与现有前端兼容），并新增版本与差异字段：

```json
{
  "request_id": "req-123",
  "destination": "beijing",
  "start_date": "2026-04-10",
  "version": 3,
  "parent_version": 2,
  "map_provider": "amap",
  "days": [],
  "changes": [
    {
      "change_type": "replan_window",
      "day_index": 1,
      "block_id": "d2-14-17-002",
      "start_hour": 14,
      "end_hour": 17,
      "old_poi": "豫园",
      "new_poi": "武康路",
      "reason": "window_rebalance_food_density"
    }
  ],
  "conflicts": [],
  "warnings": [],
  "generated_at": "2026-03-19T09:10:00Z",
  "request_snapshot": {
    "user_id": "user-123"
  }
}
```

### 4.6 典型失败

`400 BAD_REQUEST`（参数错误）：

```json
{
  "error": "BAD_REQUEST",
  "message": "targets[0].start_hour must be less than end_hour",
  "timestamp": "2026-03-19T09:12:00Z"
}
```

`403 FORBIDDEN`（越权）：

```json
{
  "error": "FORBIDDEN",
  "message": "cannot replan other user itinerary",
  "timestamp": "2026-03-19T09:12:10Z"
}
```

`200 with conflicts`（业务冲突，不抛 HTTP 错误）：

```json
{
  "version": 3,
  "parent_version": 2,
  "changes": [],
  "conflicts": [
    {
      "code": "WINDOW_ALL_LOCKED",
      "message": "target window contains only locked blocks",
      "day_index": 1
    }
  ],
  "warnings": []
}
```

---

## 5. 接口二：回退（新增）

### 5.1 Endpoint

- `POST /api/v1/plans/revert`

### 5.2 请求体

```json
{
  "saved_plan_id": "5a10d7bb-8ed0-40f3-8de4-694417311f2a",
  "target_version": 2
}
```

### 5.3 校验规则

- `saved_plan_id` 必填。
- `target_version` 必填，且必须存在于该行程历史版本中。
- 用户只能回退自己的行程。
- 回退结果必须创建新版本（`new_version = current_version + 1`），不得覆盖旧版本。

### 5.4 成功响应（200）

```json
{
  "saved_plan_id": "5a10d7bb-8ed0-40f3-8de4-694417311f2a",
  "version": 6,
  "parent_version": 5,
  "itinerary": {
    "version": 6,
    "parent_version": 5,
    "changes": [
      {
        "change_type": "revert",
        "reason": "reverted_to_version_2"
      }
    ]
  }
}
```

### 5.5 失败响应

- `404 NOT_FOUND`：`saved plan not found`
- `400 BAD_REQUEST`：`target_version not found`
- `403 FORBIDDEN`：`cannot revert other user itinerary`

---

## 6. 接口三：版本历史（新增）

### 6.1 Endpoint

- `GET /api/v1/plans/saved/{id}/versions?limit=20`

### 6.2 Query 参数

- `limit` 可选，默认 `20`，范围 `1-20`（超出自动 clamp）。

### 6.3 成功响应（200）

```json
[
  {
    "version": 6,
    "parent_version": 5,
    "created_at": "2026-03-19T09:30:00Z",
    "summary": "回退到 v2",
    "change_count": 1,
    "change_types": ["revert"]
  },
  {
    "version": 5,
    "parent_version": 4,
    "created_at": "2026-03-19T09:20:00Z",
    "summary": "第2天下午局部重排",
    "change_count": 2,
    "change_types": ["replan_window"]
  }
]
```

### 6.4 保留策略

- 服务端仅保留最近 20 个版本（含当前版本）。
- 当新版本写入超过 20 时，按最旧优先淘汰。

---

## 7. 地图字段契约（前后端联调必备）

### 7.1 Block 地图字段

每个可渲染点位 block 应尽量提供：

- `poi`
- `poi_lat`
- `poi_lon`
- `poi_map_url`

### 7.2 Transit 字段

- `from_poi` / `to_poi`
- `from_lat` / `from_lon`
- `to_lat` / `to_lon`
- `minutes`
- `navigation_url`

### 7.3 Map Provider

- `itinerary.map_provider` 固定返回 `"amap"`。
- 本期不提供 provider 切换字段。

---

## 8. 向后兼容策略

- `POST /plans/replan` 维持“返回完整 itinerary”不变。
- 旧前端不识别 `version/changes/conflicts` 时可忽略，不影响基本展示。
- 服务端兼容 `preserve_locked`（旧字段）并映射到 `keep_locked`。
- 对未携带 `block_id` 的请求，允许基于 `day_index+start_hour+end_hour` 兜底定位。

---

## 9. 测试清单（最小）

- 重排窗口合法性校验（小时范围、起止顺序、day_index）。
- `lock/unlock` 对后续重排约束是否生效。
- 冲突场景：目标窗口全锁定。
- 回退必须产生新版本（不覆盖历史）。
- 版本保留上限 20 的淘汰策略正确。
- 兼容字段 `preserve_locked` 可用。

---

## 10. 变更记录

- 2026-03-19：首次发布 v1，覆盖重排扩展、回退、版本列表、地图字段契约。
