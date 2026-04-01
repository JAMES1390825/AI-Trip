# AI Trip 个人私有信号层 PRD（v1）

更新时间：2026-04-01  
状态：Draft for Product / Backend / App Review  
适用范围：`apps/trip-api-go` + `apps/mobile-ios`

关联文档：
- [trip-personal-and-community-prd-v1.md](./trip-personal-and-community-prd-v1.md)
- [trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)
- [trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)
- [trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md)
- [trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)
- [trip-user-private-signals-tasklist-v1.md](./trip-user-private-signals-tasklist-v1.md)

---

## 1. 文档目标

本文件将“用户私有行为层”从系统蓝图中的概念，收敛为一套可开发、可联调、可验证的 v1 方案。

本文件重点回答 5 个问题：

1. 当前个人层到底要采哪些用户行为。
2. 这些行为如何沉淀成结构化 `UserPrivateProfile`。
3. 画像更新规则如何设计，才能既有效又不过度自信。
4. 私有画像应在规划系统哪个阶段接入。
5. 如何确保私有信号只服务当前用户本人，不污染其他用户。

核心目标：

`让系统逐步记住同一个用户自己的真实偏好，并只影响该用户后续的候选排序、排程软约束与解释层表达。`

---

## 2. 范围与非目标

### 2.1 本期范围

v1 只做以下 4 件事：

1. 记录用户关键行为事件。
2. 将事件投影为结构化用户私有画像。
3. 在候选排序和排程软约束中读取当前用户画像。
4. 在结果页输出轻量个性化解释。

### 2.2 本期不做

1. 不做跨用户共享学习。
2. 不做社区公开内容接入。
3. 不做复杂机器学习训练或 embedding 召回。
4. 不做用户画像管理中心。
5. 不允许私有画像修改 POI、路线、天气、营业状态等事实字段。

### 2.3 成功定义

如果 v1 做得对，用户应有以下体感变化：

1. 经常删除的点位类型，不会继续高频出现。
2. 经常保留或执行的路线风格，会更自然地出现在后续结果中。
3. 节奏、通勤容忍度、雨天偏好会逐步影响排序和排布。
4. 系统更“像懂你”，但不会变成不可解释的黑盒。

---

## 3. 核心原则

### 3.1 默认私有

所有原始行为事件和用户私有画像都必须按 `user_id` 强隔离。

### 3.2 当前输入优先

本次会话中的 `must_go`、`avoid`、`travel_styles`、`budget_level`、`pace` 等显式输入，优先级高于历史画像。

### 3.3 事实层不可改写

私有画像只能影响排序和软约束，不能改写：

1. 正式 POI 真值
2. 路线时长真值
3. 天气真值
4. 营业时间真值

### 3.4 软性加权，不是硬性接管

用户私有画像在 v1 只能作为 `user_profile_score` 参与排序，不直接决定某个点位“必须出现”或“必须消失”。

### 3.5 低样本保守

没有足够行为样本时，系统应弱生效或不生效，避免一次误操作把用户永久打上错误标签。

---

## 4. 用户价值与核心场景

### 4.1 核心用户价值

个人层的价值不是让系统“更会聊天”，而是让系统“更懂这个用户到底会怎么改路线”。

### 4.2 优先覆盖的用户场景

1. 用户总删掉商场类点位，希望系统后续减少推送。
2. 用户经常把商场替换成江景、夜景、步行类点位，希望系统学会这个迁移规律。
3. 用户总把午餐拖后、减少跨区通勤，希望系统逐步调整节奏。
4. 用户雨天时更接受室内点位，希望天气和个人偏好共同参与排序。

### 4.3 不应出现的错误体验

1. 用户只误删一次，系统就长期不再推荐该类型。
2. 用户本次明确想去某类地点，但历史画像把它压掉。
3. 个性化结果无法解释，用户不知道为什么这样排。
4. A 用户的行为直接影响 B 用户的结果。

---

## 5. 事件模型

### 5.1 v1 事件范围

建议优先冻结以下 8 个事件：

| 事件名 | 触发时机 | 作用 |
|---|---|---|
| `plan_generated` | 生成成功返回 itinerary | 记录曝光，不直接强更新画像 |
| `plan_saved` | 用户保存路线 | 中强正向信号，代表总体认可 |
| `block_removed` | 用户删除 block | 强负向信号 |
| `block_replaced` | 用户替换 block | 最强偏好迁移信号 |
| `block_locked` | 用户锁定保留 block | 强正向信号 |
| `poi_detail_opened` | 打开点位详情 | 弱正向兴趣信号 |
| `navigation_started` | 用户开始导航 | 强执行信号 |
| `preference_changed` | 用户主动修改偏好项 | 直接更新显式偏好 |

### 5.2 统一事件结构

```json
{
  "event_name": "block_replaced",
  "user_id": "u_123",
  "plan_id": "plan_001",
  "metadata": {
    "day_index": 1,
    "block_id": "day_1_block_2",
    "provider": "amap",
    "removed_provider_place_id": "B0FF111",
    "removed_category": "shopping",
    "removed_tags": ["mall", "indoor"],
    "added_provider_place_id": "B0FF222",
    "added_category": "sight",
    "added_tags": ["river_view", "night_view"],
    "route_minutes_from_prev": 16,
    "change_reason": "prefer_scenery",
    "client_ts": "2026-04-01T09:20:00+08:00"
  },
  "created_at": "2026-04-01T09:20:03Z"
}
```

### 5.3 metadata 最小字段建议

所有事件尽量补齐：

1. `plan_id`
2. `day_index`
3. `block_id`
4. `provider`
5. `provider_place_id`
6. `poi_name`
7. `poi_category`
8. `poi_tags`
9. `source_mode`
10. `client_ts`

替换类事件额外补齐：

1. `removed_provider_place_id`
2. `removed_category`
3. `removed_tags`
4. `added_provider_place_id`
5. `added_category`
6. `added_tags`

### 5.4 事件权重建议

| 事件 | 对画像的默认影响 |
|---|---|
| `preference_changed` | 最强，直接更新显式偏好 |
| `navigation_started` | 强正向，比详情点击更可靠 |
| `block_locked` | 强正向，表示明确保留 |
| `block_removed` | 强负向，但需保守处理 |
| `block_replaced` | 删除目标减分，替入目标加分 |
| `plan_saved` | 中强正向，表示整体认可 |
| `poi_detail_opened` | 弱正向，单日封顶 |
| `plan_generated` | 默认只做曝光计数 |

---

## 6. 用户私有画像模型

### 6.1 UserPrivateProfile v1

```json
{
  "user_id": "u_123",
  "version": 1,
  "explicit_preferences": {
    "budget_level": "medium",
    "pace": "relaxed",
    "travel_styles": ["citywalk", "night_view"],
    "dining_preference": "local_food",
    "weather_preference": "rain_friendly"
  },
  "behavioral_affinity": {
    "categories": {
      "sight": 0.42,
      "food": 0.35,
      "shopping": -0.58
    },
    "tags": {
      "citywalk": 0.74,
      "night_view": 0.69,
      "river_view": 0.63,
      "mall": -0.61
    },
    "districts": {
      "310101": 0.18,
      "330106": 0.27
    }
  },
  "timing_profile": {
    "preferred_daily_blocks": 3.2,
    "lunch_offset_minutes": 45,
    "max_transit_minutes": 28
  },
  "risk_profile": {
    "rain_avoid_outdoor": 0.63,
    "walking_tolerance": 0.66,
    "queue_tolerance": 0.24
  },
  "stats": {
    "events_30d": 37,
    "effective_actions_30d": 12,
    "saved_plans_30d": 4
  },
  "confidence": {
    "behavioral_affinity": 0.74,
    "timing_profile": 0.56,
    "risk_profile": 0.48
  },
  "updated_at": "2026-04-01T09:00:00Z"
}
```

### 6.2 字段解释

#### 6.2.1 explicit_preferences

来源于用户主动填写或显式修改的偏好项。  
优先级最高，行为推断不得反向覆盖。

#### 6.2.2 behavioral_affinity

系统根据用户行为推断的偏好分布。  
建议分值范围为 `-1.0 ~ 1.0`：

1. 负数表示明显排斥
2. 0 表示未知或中性
3. 正数表示明显偏好

#### 6.2.3 timing_profile

用于表达节奏与通勤容忍度。  
这类画像应只影响排程软约束，不直接影响事实判断。

#### 6.2.4 risk_profile

用于表达雨天接受度、排队容忍度、步行容忍度等风险偏好。

#### 6.2.5 confidence

必须单独存储，用于控制：

1. 何时允许画像生效
2. 生效强度有多大
3. 是否允许向用户展示解释

---

## 7. 更新规则

### 7.1 投影器模型

v1 推荐使用“规则投影器”，不使用训练模型。

统一更新公式建议：

```text
new_score = clamp(decay(old_score) + delta(event), -1.0, 1.0)
```

其中：

1. `decay(old_score)`：做时间衰减，避免远古行为长期霸占画像。
2. `delta(event)`：按不同事件给予不同增量。
3. `clamp`：保证分值不出界。

### 7.2 时间衰减建议

推荐使用 30 天半衰期。

规则：

1. 最近 7 天行为影响最大。
2. 30 天前行为显著减弱。
3. 90 天前若无重复行为，应基本不再主导结果。

### 7.3 生效阈值建议

为了避免误伤，建议采用以下保守阈值：

1. 至少 2 次一致性强行为后，画像才明显影响排序。
2. `poi_detail_opened` 单日加分应设上限，避免误点污染。
3. `block_removed` 的单次负向影响不应直接把某一类点位打到极低分。
4. `confidence < 0.4` 时，画像仅做极弱影响。

### 7.4 默认增量参考

| 行为 | 建议增量 |
|---|---|
| 显式设置 `travel_styles += citywalk` | `+0.80` |
| 保存含 `night_view` 的路线 | `+0.20` |
| 启动导航到 `night_view` 点位 | `+0.35` |
| 删除 `shopping` block | `-0.35` |
| 将 `shopping` 替换成 `river_view` | `shopping -0.45`，`river_view +0.45` |
| 打开 POI 详情页 | `+0.05`，单日封顶 `0.15` |
| 选择“少走路”优化 | `max_transit_minutes -3`，`walking_tolerance -0.08` |
| 选择“下雨也能玩”优化 | `rain_avoid_outdoor -0.12`，`indoor` 标签 `+0.15` |

### 7.5 冲突处理规则

1. 显式偏好永远覆盖同维度行为推断。
2. 新近行为优先于久远行为。
3. 执行行为优先于浏览行为。
4. 保存 / 锁定 / 导航优先于详情点击。

---

## 8. 在线规划接入点

### 8.1 接入总原则

个人层只接入两个地方：

1. 候选排序
2. 排程软约束

不接入：

1. 事实层真值判断
2. provider 返回值修正
3. 正式天气 / 路线 / 营业时间写入

### 8.2 候选排序

建议新增 `user_profile_score`，初始只作为软加权项：

```text
final_score
= factual_score * 0.75
+ brief_match_score * 0.15
+ user_profile_score * 0.10
```

`user_profile_score` 可由以下子项组成：

1. `category_affinity_score`
2. `tag_affinity_score`
3. `district_affinity_score`
4. `transit_tolerance_score`
5. `weather_preference_score`

### 8.3 排程软约束

v1 只建议影响：

1. 每日 block 数量上限
2. 午餐偏移时间
3. 最大建议通勤分钟数
4. 雨天时室内候选的加权优先级

### 8.4 必须锁死的边界

1. `must_go` 永远优先于私有画像。
2. `avoid` 永远高于私有画像。
3. 私有画像只能加减分，不能凭空创造点位。
4. 单一画像因子对总分影响建议先限制在 `±0.15` 内。
5. 冷启动用户必须完全回退到现有事实链路。

---

## 9. 解释层设计

### 9.1 解释原则

只有在画像有足够置信度时，才允许对用户展示个性化解释。

### 9.2 建议解释文案

允许：

1. “这次更偏步行和江景，是因为你最近更常保留这类点位。”
2. “已尽量减少跨区通勤，因为你最近更常调整长距离移动。”
3. “雨天时优先了更稳妥的候选，因为你此前更常接受这类安排。”

不允许：

1. “系统判断你是什么性格，所以这样排。”
2. “我们认为你不喜欢某类人群常去的地方。”
3. “根据其他用户行为，我们替你做了这个决定。”

### 9.3 解释展示建议

v1 只做轻量解释，不做画像管理页。  
结果页可在“为什么这样排”区域展示 1~2 条低打扰文案。

---

## 10. 接口与工程落点

### 10.1 后端数据落点建议

建议在当前 Go 主线新增：

1. `user_events`
2. `user_private_profiles`
3. 可选 `user_profile_update_logs`

若继续沿用当前本地文件存储模型，则对应需要新增：

1. `ProfilesByUser map[string]UserPrivateProfile`
2. `ProfileUpdateLogs []ProfileUpdateLog`

### 10.2 建议新增模块

建议新增：

1. `profile_projector.go`
2. `profile_scoring.go`
3. `profile_types.go` 或直接扩展 `types.go`

### 10.3 接口建议

已有接口继续复用：

1. `POST /api/v1/events`

建议后续补一个仅当前用户可见的调试接口：

1. `GET /api/v1/profile/private-summary`

该接口只返回精简摘要，不暴露完整原始行为明细。

### 10.4 移动端接入点

建议在以下动作打事件：

1. 生成成功
2. 保存成功
3. 打开 POI 详情
4. 删除 block
5. 替换 block
6. 锁定 block
7. 开始导航
8. 调整偏好

---

## 11. 指标与验收

### 11.1 产品指标

上线后重点看：

1. `plan_generated -> plan_saved` 转化是否提升
2. `block_removed` 比例是否下降
3. `block_replaced` 比例是否下降
4. `must_go_hit_rate` 是否保持稳定
5. 个性化解释曝光后是否提升保存率

### 11.2 工程指标

1. 用户画像读取失败时，不影响主链路生成。
2. 冷启动用户结果与当前版本差异可控。
3. 画像更新失败时只降级个性化，不阻塞生成。
4. 画像和事件都可按 `user_id` 追溯。

### 11.3 v1 DoD

满足以下条件即可视为 v1 完成：

1. 关键事件已稳定上报。
2. 每个用户可生成并更新 `UserPrivateProfile`。
3. 候选排序已接入 `user_profile_score`。
4. 画像不会跨用户生效。
5. 结果页可展示轻量个性化解释。
6. 至少有一轮回归样本验证“删商场 -> 后续少推商场”等核心场景。

---

## 12. 分期建议

### Phase P1：事件层打底

目标：

- 让所有关键个人行为都能被稳定记录

交付：

1. 事件枚举冻结
2. metadata 结构冻结
3. 客户端关键埋点接入
4. 服务端事件持久化与校验

### Phase P2：私有画像生成

目标：

- 从事件稳定生成用户画像

交付：

1. `UserPrivateProfile` schema
2. 画像投影器
3. 时间衰减与置信度逻辑
4. 调试查看接口

### Phase P3：排序与排程接入

目标：

- 让画像开始真正影响结果

交付：

1. 候选排序接入 `user_profile_score`
2. 节奏与通勤软约束接入
3. 冷启动回退逻辑

### Phase P4：解释与评估

目标：

- 让个性化能力可见、可验证、可调优

交付：

1. 结果页轻量解释
2. 个性化实验指标
3. 回归样本与验收脚本

---

## 13. 与后续阶段的关系

本文件只覆盖“个人私有层”。  
后续若进入：

1. 全局聚合层
2. 社区公开层
3. 跨用户经验回灌

必须在隐私边界、样本阈值和治理机制上另行设计，不得直接复用本文件的私有原始事件作为跨用户在线输入。
