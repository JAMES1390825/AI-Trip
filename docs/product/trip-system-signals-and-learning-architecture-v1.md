# AI Trip 系统信号、反馈闭环与社区学习架构（v1）

更新时间：2026-03-31  
状态：Current Mainline Design  
适用范围：`apps/trip-api-go` + `apps/trip-ai-service` + `apps/mobile-ios` + `apps/web-client`

关联文档：
- [trip-personal-and-community-prd-v1.md](./trip-personal-and-community-prd-v1.md)
- [trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)
- [trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md)
- [trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)
- [trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)
- [trip-user-private-signals-prd-v1.md](./trip-user-private-signals-prd-v1.md)
- [trip-user-private-signals-tasklist-v1.md](./trip-user-private-signals-tasklist-v1.md)
- [../adr/ADR-001-tech-stack-and-boundaries.md](../adr/ADR-001-tech-stack-and-boundaries.md)

---

## 1. 文档目标

本文件回答 4 个当前主线问题：

1. 这个系统如何从“一次性 AI 规划器”演进为“会持续学习的旅行规划系统”。
2. 用户改动、全局统计、社区内容与地图事实要如何分层。
3. 个人用户的私有行为是否需要隔离，技术上怎么隔离。
4. 后续优化到底是调模型，还是基于数据优化系统，演进路径是什么。

核心结论：

`AI Trip 不应只是一层模型，而应是 事实层 + 决策层 + 反馈层 + 聚合层 + 社区层 + 解释层 的组合系统。`

个人层与社区层的新产品需求主线，见 [trip-personal-and-community-prd-v1.md](./trip-personal-and-community-prd-v1.md)。

---

## 2. 系统核心原则

### 2.1 事实与经验分层

地图、路线、天气、营业时间、坐标等属于事实层。  
用户反馈、个人偏好、社区经验、聚合统计属于经验层。

原则：

1. 经验层可以影响排序，不可以直接覆盖事实。
2. 社区说“晚上更适合来”可以作为经验信号。
3. 社区说“今天营业到 23:00”不能直接作为正式事实。

### 2.2 系统决策，模型表达

模型适合做：

1. 需求理解
2. 追问补全
3. 文案解释
4. 结构化摘要

模型不适合直接做：

1. 正式 POI 真值选择
2. 路线时长真值
3. 天气真值
4. 社区原始内容的可信度判定

### 2.3 私有优先，公开需授权

用户改动首先属于个人私有信号。  
只有在以下条件满足时，信号才可跨用户使用：

1. 已去身份化
2. 已聚合
3. 达到样本阈值
4. 或者用户明确授权公开

### 2.4 学习目标是“排序更准”，不是“自由生成更多”

后续数据驱动优化应优先改进：

1. 候选召回
2. 候选排序
3. 槽位匹配
4. 风险规避
5. must-go / avoid 约束命中

而不是先追求让模型“说得更像人”。

---

## 3. 信号分层模型

### 3.1 事实层

来源：

1. 高德 POI
2. 高德路线
3. 高德天气
4. 未来的其他地图 / 路况 provider

特点：

1. 强约束
2. 可追溯
3. 不允许模型脑补

### 3.2 用户显式输入层

包括：

1. `destination`
2. `must_go`
3. `avoid`
4. `budget_level`
5. `pace`
6. `travel_styles`
7. `dining_preference`
8. `weather_preference`
9. `lodging_anchor`

特点：

1. 当前会话强优先级
2. 直接进入规划约束

### 3.3 用户私有行为层

包括：

1. 删除了哪个 block
2. 把哪个 POI 替换成什么
3. 锁定保留了什么
4. 喜欢 / 不喜欢哪些点
5. 经常查看什么类型详情
6. 最终保存的是哪种路线

特点：

1. 只服务当前用户
2. 默认私有
3. 可即时影响下次同用户规划

个人层的详细事件模型、画像 schema 与排序接入规则，见 [trip-user-private-signals-prd-v1.md](./trip-user-private-signals-prd-v1.md)。  
开发拆分与交付顺序见 [trip-user-private-signals-tasklist-v1.md](./trip-user-private-signals-tasklist-v1.md)。

### 3.4 全局聚合层

包括：

1. `poi_keep_rate`
2. `poi_replace_rate`
3. `slot_fit_rate`
4. `poi_pair_transition_score`
5. `city_slot_preference`
6. `cohort_slot_preference`

特点：

1. 匿名化
2. 异步聚合
3. 延迟生效
4. 可以服务所有用户

### 3.5 社区公开层

包括：

1. 用户公开分享的路线
2. 用户公开提交的 POI 标签
3. 社区公开的避坑提示
4. 路线保存和复用次数

特点：

1. 明确 opt-in
2. 进入主系统前需要治理
3. 只输出结构化信号，不直接当自由文本事实

### 3.6 解释层

包括：

1. 推荐理由
2. 今日建议
3. 风险提示说明
4. 结果页摘要

特点：

1. 只能引用上面各层已确认的结构化信息
2. 不能新增正式事实

---

## 4. 隔离策略

### 4.1 为什么必须隔离

如果没有隔离，会出现两个严重问题：

1. User A 删除某个点，直接污染 User B 的推荐。
2. 私有行为和社区公开内容混在一起，权限和可信度都说不清楚。

因此必须遵循：

`个人原始行为私有化 -> 群体统计匿名化 -> 社区内容授权公开化`

### 4.2 四类存储边界

| 层 | 主键 | 是否带 user_id | 是否可跨用户直接读取 | 在线规划是否可用 |
|---|---|---|---|---|
| 事实层 | `provider_place_id` / `adcode` | 否 | 是 | 是 |
| 个人层 | `user_id` | 是 | 否 | 是 |
| 聚合层 | `poi/cohort/city` | 否 | 是 | 是 |
| 社区层 | `public_route_id/public_tag_id` | 可追溯作者，但读取时只读公开数据 | 仅公开内容可用 | 是 |

### 4.3 跨层流转规则

允许：

1. 私有行为更新当前用户画像
2. 私有行为进入异步聚合任务
3. 聚合结果回灌全局打分
4. 用户显式公开后进入社区层

不允许：

1. 原始私有事件直接进入所有用户在线打分
2. 未审核社区文本直接进入正式 itinerary 事实字段
3. 模型绕过事实层写入营业时间、天气、价格等字段

### 4.4 样本阈值保护

聚合层的统计信号建议至少满足：

1. 最少唯一用户数阈值
2. 最少事件数阈值
3. 最低最近窗口样本阈值

在样本不足时：

1. 可以继续对个人层生效
2. 不能进入全局层

---

## 5. 数据流与处理流

### 5.1 在线写路径

```text
用户生成/查看/修改路线
  -> App 调用事件接口
  -> trip-api-go 记录原始事件
  -> 更新个人层画像或近期行为缓存
  -> 异步触发聚合任务
```

### 5.2 在线读路径

```text
规划请求
  -> 读取事实层候选
  -> 读取当前用户画像
  -> 读取全局聚合统计
  -> 读取社区公开结构化信号
  -> 统一打分
  -> 规则组装
  -> 校验
  -> explain 层表达
```

### 5.3 异步学习路径

```text
原始事件
  -> 每小时 / 每日聚合
  -> 生成 poi_stats / slot_stats / cohort_stats / pair_stats
  -> 回灌评分权重或特征表
  -> 后续用于轻量 rerank 模型训练
```

---

## 6. 关键数据模型

### 6.1 原始事件模型

建议扩展当前 `EventRecord`，统一沉淀以下事件：

1. `plan_generated`
2. `plan_saved`
3. `plan_replanned`
4. `block_removed`
5. `block_replaced`
6. `block_locked`
7. `poi_liked`
8. `poi_disliked`
9. `poi_visited`
10. `poi_not_fit`
11. `place_detail_opened`
12. `community_route_published`
13. `community_tag_submitted`
14. `community_tag_voted`

建议 metadata 最少包含：

```json
{
  "saved_plan_id": "plan-1",
  "block_id": "d1-09-11-01",
  "destination": "上海市",
  "slot_type": "food",
  "provider": "amap",
  "provider_place_id": "poi-benbang",
  "plan_variant": "balanced",
  "budget_level": "medium",
  "pace": "relaxed",
  "travel_styles": ["citywalk", "culture"],
  "old_provider_place_id": "",
  "new_provider_place_id": ""
}
```

### 6.2 个人画像模型

建议新增 `UserPreferenceProfile`：

```json
{
  "user_id": "u-1",
  "updated_at": "2026-03-31T12:00:00Z",
  "museum_affinity": 0.82,
  "street_affinity": 0.74,
  "night_view_affinity": 0.69,
  "local_food_affinity": 0.88,
  "rain_sensitivity": 0.71,
  "queue_tolerance": 0.35,
  "walking_tolerance": 0.62
}
```

用途：

1. 只对当前用户在线生效
2. 不直接对外暴露给其他用户

### 6.3 全局统计模型

建议新增：

1. `POIGlobalStats`
2. `POISlotStats`
3. `POIPairStats`
4. `CohortSlotStats`

示例：

```json
{
  "provider_place_id": "poi-bund",
  "slot_type": "night",
  "city": "上海市",
  "keep_rate": 0.84,
  "replace_rate": 0.09,
  "like_rate": 0.79,
  "save_assist_rate": 0.68,
  "sample_users": 128,
  "sample_events": 412,
  "updated_at": "2026-03-31T12:00:00Z"
}
```

### 6.4 社区信号模型

建议社区层只输出结构化信号：

```json
{
  "provider_place_id": "poi-bund",
  "public_tag_scores": {
    "photo_friendly": 0.92,
    "night_better": 0.88,
    "rain_friendly": 0.31,
    "queue_long": 0.57
  },
  "public_route_mentions": 186,
  "community_save_rate": 0.63,
  "updated_at": "2026-03-31T12:00:00Z"
}
```

---

## 7. 在线评分模型

### 7.1 当前推荐打分口

当前候选池主打分在：

- `apps/trip-api-go/internal/app/planner_provider_candidates.go`

后续应继续围绕这层扩展，而不是把主决策交给模型。

### 7.2 建议评分公式

```text
FinalScore
= FactScore
+ PersonalScore
+ AggregateScore
+ CommunityScore
- RiskPenalty
```

### 7.3 各分项说明

`FactScore`

1. 地理位置与槽位匹配
2. 类型匹配
3. 营业时间与时段匹配
4. 路线与天气适配
5. must-go 命中

`PersonalScore`

1. 这个用户是否历史上常保留该类点
2. 是否常删除该类点
3. 是否偏好 night / museum / street / local food

`AggregateScore`

1. 全局保留率
2. 槽位适配率
3. 同城市表现
4. 同 cohort 表现

`CommunityScore`

1. 公开标签得分
2. 公共路线复用率
3. 公开避坑标签

`RiskPenalty`

1. 高频替换点
2. 雨天高风险点
3. 排队问题重灾区
4. provider 证据不足
5. fallback 成分过高

---

## 8. 社区模块设计

### 8.1 社区层应该收什么

建议只收这三类结构化内容：

1. 公开路线
2. 公开 POI 标签
3. 公开简短避坑 / 建议卡片

### 8.2 社区层不应直接收什么

1. 未审核长文本直接进入排序
2. 原始评论全文直接当事实
3. 未授权的个人行为轨迹

### 8.3 社区治理要求

1. 公开发布必须显式选择
2. 标签投票需去重
3. 需要举报与审核机制
4. 作者信誉分与内容降权机制需预留

---

## 9. 机器学习在系统中的位置

### 9.1 当前阶段

优先级：

1. 先做规则 + 权重系统
2. 再做统计驱动优化
3. 数据够了再做轻量 rerank

### 9.2 适合训练的目标

后续 ML 最适合预测：

1. 某个 POI 在某个槽位被保留的概率
2. 某个 POI 被替换的概率
3. 某个计划被保存的概率
4. 某类用户对某个 POI 的满意概率

### 9.3 不建议一开始做的事

1. 用大模型端到端生成正式路线
2. 让模型直接吸收未经治理的社区文本
3. 把 explain 模型当作事实主引擎

---

## 10. 当前仓库中的实现边界

### 10.1 `apps/trip-api-go`

负责：

1. API 边界
2. 候选召回
3. 排序与组装
4. 校验
5. 事件写入
6. 未来的画像与聚合读取

### 10.2 `apps/trip-ai-service`

负责：

1. brief 理解增强
2. chat intake 润色
3. itinerary explain

不负责：

1. 最终 POI 真值
2. 路线真值
3. 用户私有信号的跨用户传播

### 10.3 `apps/mobile-ios`

负责：

1. 用户输入与反馈采集
2. 结果页显示来源与解释
3. 公开分享入口
4. 社区公开操作入口

### 10.4 后续服务拆分建议

当前阶段建议先逻辑隔离，不急于物理拆服务。  
当数据量与协作复杂度上升后，可逐步拆为：

1. `feedback-service`
2. `community-service`
3. `signal-aggregator`

---

## 11. 分阶段落地建议

### Phase A：先把数据写下来

1. 扩展事件模型
2. 增加 block / poi 反馈接口
3. App 接入关键动作埋点

### Phase B：先把私有和聚合层做出来

1. 个人画像表
2. POI 全局统计表
3. 分群统计表
4. 在线评分读取私有层和聚合层

### Phase C：补社区公开层

1. 公开路线
2. 公开 POI 标签
3. 社区治理机制

### Phase D：再考虑轻量 ML

1. 用事件和统计特征训练 rerank
2. 继续由系统做主决策
3. 模型仍只负责解释和辅助理解

---

## 12. 当前阶段的最终判断

对 AI Trip 来说，后续最重要的不是“让模型更会说”，而是建立一套：

1. 个人行为私有化
2. 群体经验匿名化
3. 社区内容公开授权化
4. 地图事实独立可信化
5. 候选排序可持续学习化

这套系统一旦建立起来，后面不论你是接外部评论源、积累自有用户反馈，还是做轻量机器学习，都会有稳定落点。
