# AI Trip 移动端真实数据接入与抗幻觉架构方案（v1）

更新时间：2026-03-31  
状态：用于产品 / 架构 / 客户端 / 后端联合评审  
适用范围：`apps/mobile-ios` + `apps/trip-api-go`

关联文档：
- [trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)
- [trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)
- [trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)
- [trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md)

---

## 1. 文档目标

这份文档回答 3 个关键问题：

1. 如何把当前“样例点位 + 规则模板”的生成链路升级为“真实数据驱动”的规划链路。
2. 模型应该介入哪里，哪些环节必须由确定性系统负责。
3. 如何在保证体验顺滑的前提下，系统性降低模型幻觉、伪事实和不可验证结果。

本方案不追求“所有内容都交给大模型生成”，而是明确采用：

`数据先行 -> 规则排程 -> 模型解释 -> 校验兜底`

---

## 2. 当前现状与问题

### 2.1 当前实现现状

当前主生成链路的核心仍是本地规则生成：

1. `POST /api/v1/plans/generate` 在服务端将请求直接交给 `generateItinerary(...)`
2. `generateItinerary(...)` 使用内置城市点位目录 `catalogByCity`
3. 每天的行程按固定槽位生成：
- `09:00-11:00`
- `11:00-13:00`
- `14:00-17:00`
- `19:00-21:00`
4. 推荐理由、风险、通勤时间、替代建议以规则和模板为主
5. 聊天补全链路当前仍是 `fallback_mode = "rules"`

### 2.2 当前问题

1. 点位来源不是真实世界数据，无法保证地点、营业状态、动线和时长可信。
2. 行程结果缺少来源证据，用户无法判断“为什么是这个点”。
3. 文本层即使看起来像 AI，也容易让用户误以为系统在“编”。
4. 模型如果直接参与地点生成，会进一步放大幻觉风险。
5. 当前客户端和服务端的数据结构没有为“来源、置信度、校验结果、证据链”预留稳定字段。

### 2.3 目标定义

本次架构升级的目标不是“让模型看起来更聪明”，而是：

1. 行程中的每个正式点位都可追溯来源。
2. 规划时优先使用真实 POI、真实坐标、真实路线时间、真实天气和营业信息。
3. 模型不再负责发明事实，只负责理解需求、辅助排序、生成解释和补充澄清。
4. 所有结果在落库和回传前都经过确定性校验。

---

## 3. 核心设计原则

### 3.1 事实与表达分层

我们明确拆成 3 层：

1. `事实层`
负责真实世界数据获取与标准化，包括城市、POI、路线、天气、营业状态、坐标和导航链接。

2. `规划层`
负责候选筛选、约束求解、路线排程、预算和节奏控制、冲突修复。

3. `表达层`
负责将结构化事实转成用户可理解的推荐理由、风险提示、今日建议和替代说明。

原则：

- 事实层不依赖模型补全。
- 规划层不允许模型私自新增事实。
- 表达层即使由模型生成，也只能引用事实层已经确认的数据。

### 3.2 模型后置，不做真相源

模型不作为 POI、营业时间、评分、价格、路线时间的真相来源。  
这些字段必须来自 provider、缓存或规则校验结果。

### 3.3 无来源，不入正式结果

任何进入正式 itinerary 的地点，必须具备至少以下字段：

1. `provider`
2. `provider_place_id`
3. `poi`
4. `lat`
5. `lng`
6. `source_fetched_at`

缺任一项时：

- 可作为灵感候选存在
- 不能成为正式行程 block

### 3.4 可解释优先于“像 AI”

用户更在意“为什么排这里”和“这是不是靠谱”，而不是单纯看到一段像 AI 写的文案。

---

## 4. Provider 选型与数据源策略

### 4.1 中国大陆主 Provider

中国大陆主 provider 建议优先接入高德 Web 服务。

原因：

1. 与当前项目已有高德 URI 导航链路一致。
2. 城市输入提示、POI 搜索、地理编码、路径规划、天气接口覆盖较完整。
3. 对中文场景、国内城市和商户检索更友好。

建议接入能力：

1. 输入提示 / 地点补全
2. 关键字 POI 搜索
3. 周边搜索
4. 地理编码 / 逆地理编码
5. 路径规划
6. 天气查询

### 4.2 海外扩展 Provider

海外建议预留第二 provider 适配层，优先考虑 Google Places / Routes。

原则：

1. 中国大陆默认高德
2. 海外默认 Google
3. Nominatim 只作为轻量地理兜底，不作为主 POI 事实源

### 4.3 Provider 抽象层

后端不要把高德 SDK / HTTP 请求直接散落在 `planner.go` 或 `server.go` 里，建议新增统一接口：

```go
type PlaceProvider interface {
    ResolveDestination(ctx context.Context, query string, locale string) ([]DestinationHit, error)
    SearchPOIs(ctx context.Context, req POISearchRequest) ([]PlaceCandidate, error)
    GetPlaceDetails(ctx context.Context, providerPlaceIDs []string) ([]PlaceDetail, error)
    GetRouteMatrix(ctx context.Context, req RouteMatrixRequest) ([]RouteLegEvidence, error)
    GetWeather(ctx context.Context, req WeatherRequest) (WeatherEvidence, error)
}
```

这样做的收益：

1. 便于做双 provider 切换
2. 便于做缓存和 mock
3. 便于后面将“真实源”和“fallback 源”分层

---

## 5. 新生成链路总览

### 5.1 目标链路

新版生成链路建议改为：

`输入归一化 -> 结构化规划 brief -> 真实检索 -> 候选打分 -> 规则排程 -> 校验修正 -> 模型解释 -> 回传客户端`

### 5.2 时序说明

```text
用户输入
  -> 目的地标准化
  -> 规划 brief 结构化
  -> 按槽位发起 POI 检索
  -> 拉取路线 / 天气 / 营业信息
  -> 形成候选池
  -> 规则求解器排程
  -> 约束校验器校验
  -> 生成 explain / alternatives / today_hint
  -> 输出 itinerary + evidence
```

### 5.3 三类输入要分开

当前生成最容易出错的一点，是把“城市”、“偏好”、“must-go 文本”混在一个字段里。

建议强制拆开：

1. `destination`
结构化城市实体，如 `上海市`

2. `must_go`
用户明确指定的点位或区域

3. `preferences`
如 `citywalk`、`雨天可执行`、`本地餐馆`、`轻松节奏`

4. `constraints`
预算、节奏、天数、开始日期、同行人、住宿地等

---

## 6. 事实层设计

### 6.1 目的地标准化

目的地输入不再只是一个字符串，而应产出结构化对象：

```json
{
  "destination_id": "amap:310000",
  "destination_label": "上海市",
  "country": "中国",
  "region": "上海",
  "adcode": "310000",
  "center_lat": 31.2304,
  "center_lng": 121.4737,
  "provider": "amap"
}
```

作用：

1. 作为后续 POI 搜索和天气查询的稳定锚点
2. 避免“上海，顺便吃本地馆子”这类混写导致退回默认数据

### 6.2 POI 候选池

每个时段不直接生成一个点，而是先形成候选池。

建议按槽位建立候选：

1. 上午景点池：景点 / 博物馆 / 公园 / 室内展馆
2. 午餐池：本地餐馆 / 评分稳定 / 距离上一个点合理
3. 下午体验池：街区 / 市集 / 艺术馆 / 体验类
4. 夜间池：夜景 / 步行街 / 江边 / 夜游类

每个候选至少包含：

```json
{
  "provider": "amap",
  "provider_place_id": "B0FF....",
  "name": "外滩",
  "category": "sight",
  "lat": 31.24,
  "lng": 121.49,
  "address": "上海市黄浦区...",
  "rating": 4.6,
  "price_level": 2,
  "opening_hours": "...",
  "indoor_capable": false,
  "tags": ["地标", "citywalk", "夜景"],
  "source_fetched_at": "2026-03-31T..."
}
```

### 6.3 路线与天气事实

路线和天气都必须入证据结构。

路线证据：

```json
{
  "from_place_id": "...",
  "to_place_id": "...",
  "minutes": 18,
  "distance_meters": 2450,
  "mode": "walking",
  "provider": "amap"
}
```

天气证据：

```json
{
  "adcode": "310000",
  "date": "2026-04-16",
  "condition": "light_rain",
  "high_temp": 21,
  "low_temp": 16,
  "provider": "amap"
}
```

---

## 7. 规划层设计

### 7.1 不让模型直接排程

正式路线排程建议先采用确定性求解：

1. 先按槽位产候选
2. 候选按打分排序
3. 用规则排程器拼接
4. 再做冲突修正

原因：

1. 更稳定
2. 更容易回放和调试
3. 更容易解释“为什么没选某个点”

### 7.2 候选打分

建议给每个候选计算总分：

```text
总分 =
  主题匹配分
  + 时段适配分
  + 距离动线分
  + 天气适配分
  + 预算适配分
  + 营业稳定分
  + must-go 加权分
```

### 7.3 约束分层

硬约束：

1. 有真实来源
2. 有坐标
3. 营业时间与时段不冲突
4. 日总时长合理
5. 相邻点位通勤不超阈值
6. must-go 尽量覆盖

软约束：

1. 风格一致性
2. 图片/拍照友好度
3. 雨天替代性
4. 预算倾向
5. 节奏偏好

### 7.4 失败时的降级

当真实数据不足时，不应伪造完整路线。

建议降级顺序：

1. 减少每天点位数
2. 降低“推荐强度”，明确提示“候选不足”
3. 进入“待你确认 2-3 个候选”的半自动模式
4. 最后才启用本地 fallback 数据

而且 fallback 结果必须明确标记：

`source_mode = fallback`

---

## 8. 模型介入边界

### 8.1 允许模型介入的环节

模型可以做：

1. 用户输入理解
将自由文本转为结构化 `planning_brief`

2. 检索任务翻译
例如将“雨天、轻松、本地餐馆”翻成检索意图

3. 候选重排
基于候选事实判断“哪个更符合 citywalk / 雨天 / 高体验”

4. 文本解释
生成 `recommend_reason`、`today_hint`、`risk_summary`

5. 澄清追问
在事实不足或冲突明显时追问用户

### 8.2 禁止模型介入的环节

模型不能做：

1. 编造新的正式 POI
2. 编造坐标、营业时间、评分、价格、路线时间
3. 编造 provider id
4. 修改已经验证通过的事实字段

### 8.3 推荐的模型输出形态

模型输出必须走结构化 schema，例如：

```json
{
  "slot_preferences": [
    {
      "slot_type": "sight",
      "preferred_tags": ["室内", "展览", "citywalk"],
      "avoid_tags": ["远郊", "纯户外"],
      "notes": "上午更适合先走核心地标或室内点"
    }
  ],
  "clarifying_question": null
}
```

不能让模型直接返回长篇 itinerary 文本后再解析。

---

## 9. 抗幻觉机制

### 9.1 七条硬规则

1. 无 `provider_place_id` 不入正式结果
2. 无坐标不入地图结果页主列表
3. 路线时间必须来自 route provider 或 route cache
4. 天气提示必须来自 weather provider 或 weather cache
5. 营业状态冲突必须显式打 warning
6. 任何模型生成文本只能引用已验证字段
7. 校验器不通过时，结果不能以“已生成正式路线”状态返回

### 9.2 输出校验器

在 `generatePlan` 最后新增校验器：

1. `ValidateSources`
检查每个 block 是否有合法 provider 和 place_id

2. `ValidateCoordinates`
检查坐标是否完整

3. `ValidateBusinessWindow`
检查营业时间是否冲突

4. `ValidateTransitContinuity`
检查相邻点位路线时长是否缺失或异常

5. `ValidatePreferenceCoverage`
检查 must-go 和关键偏好是否被覆盖

6. `ValidateNarrativeGrounding`
检查解释文案是否引用不存在字段

### 9.3 结果透明化

客户端可以显示两个轻量信号：

1. `数据来源`
例如：`数据来源：高德`

2. `可信度`
例如：`高可信 / 中可信 / 待确认`

可信度不由模型主观决定，而由事实覆盖率决定。

---

## 10. 数据模型与接口改造

### 10.1 新增概念对象

建议在后端新增这些结构：

1. `DestinationEntity`
2. `PlanningBrief`
3. `PlaceCandidate`
4. `PlaceEvidence`
5. `RouteLegEvidence`
6. `WeatherEvidence`
7. `ValidationResult`

### 10.2 `PlanRequest` 改造建议

现有请求以字符串为主，建议升级为：

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
  "budget_level": "medium",
  "pace": "relaxed",
  "travel_styles": ["citywalk", "美食"],
  "must_go": ["外滩"],
  "constraints": {
    "weather_preference": "rain_friendly",
    "lodging_anchor": null
  }
}
```

### 10.3 `ItineraryBlock` 新增字段建议

```json
{
  "provider": "amap",
  "provider_place_id": "B0FF...",
  "source_mode": "provider",
  "source_fetched_at": "2026-03-31T12:00:00Z",
  "evidence": {
    "route_minutes_from_prev": 16,
    "weather_basis": "light_rain",
    "opening_basis": "provider",
    "score_breakdown": {
      "style_fit": 0.88,
      "distance_fit": 0.91,
      "weather_fit": 0.82
    }
  },
  "confidence_tier": "high"
}
```

### 10.4 新接口建议

建议新增或拆分接口：

1. `GET /api/v1/destinations/resolve`
输入自由文本，返回结构化目的地候选

2. `POST /api/v1/plans/brief`
输入用户自然语言和结构化表单，返回标准化 `planning_brief`

3. `POST /api/v1/plans/generate-v2`
真实数据版生成链路

4. `POST /api/v1/plans/validate`
对 itinerary 做独立校验

5. `GET /api/v1/places/{provider}/{place_id}`
获取点位详情

现有 `/plans/generate` 可以保留一段时间，作为旧版 fallback。

---

## 11. 客户端交互改造建议

### 11.1 AI 规划入口页

AI 规划页需要从“纯填写表单”升级为“结构化 + 可验证”：

1. 目的地选择后展示已确认城市标签
2. must-go 单独填写，不再混入目的地
3. 对“雨天可执行 / 本地餐馆 / 轻松节奏”这类偏好做标签化处理

### 11.2 生成中页

生成中页可分 4 个阶段展示：

1. 正在确认城市与范围
2. 正在搜索真实点位
3. 正在计算路线与营业状态
4. 正在生成推荐说明

这样用户能理解系统在“查数据”，不是“空想”。

### 11.3 结果页

建议新增轻量信息：

1. `数据来源：高德`
2. `可信度：高 / 中 / 待确认`
3. `为什么选这里`
4. `如果今天下雨，替代点是什么`

### 11.4 点位详情页

点位详情建议增加：

1. 来源 provider
2. 更新时间
3. 距离前一站时间
4. 是否室内
5. 是否受天气影响

---

## 12. 服务端代码结构建议

建议将当前 `planner.go` 中的“静态目录 + 生成逻辑 + 校验逻辑”进一步拆分：

1. `provider/place_provider.go`
接口定义

2. `provider/amap_client.go`
高德调用封装

3. `provider/google_client.go`
海外 provider 预留

4. `planner/brief.go`
结构化规划 brief 生成

5. `planner/retrieval.go`
候选检索和 enrich

6. `planner/scoring.go`
候选打分

7. `planner/scheduler.go`
排程求解

8. `planner/validator.go`
输出校验

9. `planner/explainer.go`
解释文本生成

10. `cache/provider_cache.go`
第三方数据缓存

当前仓库里，`planner.go` 可以保留为过渡入口，但内部逐步转调新模块。

---

## 13. 分阶段实施建议

### Phase 1：真实数据接入

目标：

- 去掉主链路对本地点位目录的依赖

内容：

1. 接入目的地标准化
2. 接入 POI 搜索
3. 接入路径规划
4. 接入天气
5. 新增 provider cache

交付标准：

1. 正式 itinerary 中所有 block 都有 provider 和 place_id
2. 默认不再落回静态 `catalogByCity`

### Phase 2：规则排程升级

目标：

- 用真实候选 + 规则求解替代固定模板拼接

内容：

1. 候选池构建
2. 候选打分
3. 排程器
4. 校验器

交付标准：

1. must-go 覆盖更稳定
2. 通勤逻辑真实
3. 营业冲突可解释

### Phase 3：模型后置接入

目标：

- 让模型负责“理解和解释”，而不是“编事实”

内容：

1. 结构化 brief 生成
2. 候选重排
3. 推荐理由和今日建议生成
4. 澄清追问

交付标准：

1. 模型输出均为结构化 schema
2. 不存在无来源点位进入正式结果

### Phase 4：可信度与评估闭环

目标：

- 让系统可度量、可监控、可持续优化

内容：

1. 新增生成质量埋点
2. 幻觉率监控
3. 校验失败原因统计
4. 用户确认 / 替换行为回流

关键指标：

1. `provider_grounded_block_rate`
2. `route_evidence_coverage`
3. `weather_evidence_coverage`
4. `must_go_hit_rate`
5. `hallucinated_place_rate`
6. `user_replace_rate`

---

## 14. 关键风险与应对

### 14.1 第三方成本与配额

风险：

- 搜索、路径规划、详情查询会显著增加成本

应对：

1. 强缓存
2. 字段裁剪
3. 分阶段 enrich
4. 只对进入候选前列的点位拉详情

### 14.2 响应时间变长

风险：

- 真数据链路比本地规则慢

应对：

1. 生成中页分阶段反馈
2. 检索并行化
3. route matrix 批量请求
4. 结果缓存和预热

### 14.3 模型仍可能“扩写”

风险：

- 即使模型只做解释，也可能写出不存在的事实

应对：

1. 模型只读取结构化 facts
2. 输出走 schema
3. 文本 grounding 校验

### 14.4 数据不完整

风险：

- 某些城市、品类或营业信息不稳定

应对：

1. 降级策略
2. 可信度标签
3. 用户确认模式

---

## 15. 结论

这一版升级的关键不是“把规则换成大模型”，而是建立一条可靠的生成链路：

`真实数据 -> 规则排程 -> 模型解释 -> 校验兜底`

只要坚持这条顺序：

1. 真实世界事实可追溯
2. 模型不再直接编造点位
3. 用户对结果的信任会显著提升
4. 后续再叠加个性化和更强模型时，也不会失控

建议将本方案作为移动端 v2 的下一阶段主架构基线。
