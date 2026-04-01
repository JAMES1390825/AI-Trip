# AI Trip 移动端真实数据版开发任务清单（v2）
更新时间：2026-04-02
负责人建议：iOS 客户端组 + Go 后端组 + 平台 / 模型接入协作
关联方案：[trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)
关联系统蓝图：[trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)
关联架构：[trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)
关联契约：[trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md)
关联决策：[../adr/ADR-001-tech-stack-and-boundaries.md](../adr/ADR-001-tech-stack-and-boundaries.md)

---

## 1. 范围说明

本清单覆盖移动端新版主链路从“样例数据 + 规则模板”升级到“真实数据驱动 + 模型后置 + 抗幻觉校验”的完整交付。

目标链路：

`AI规划输入 -> 目的地标准化 -> Brief 结构化 -> 真实 POI 检索 -> 规则排程 -> 校验 -> 地图结果页 -> 保存/分享/回看`

本轮拆分覆盖 4 个工作流：

1. iOS 客户端 UI 与状态流升级
2. Go 后端真实数据接入与生成链路升级
3. 模型介入边界与 schema 化输出
4. 联调、评估、抗幻觉和发布收口

补充说明：

本清单默认采用“事实层、个人信号层、聚合层、社区层分层”的系统设计，个人用户原始改动不直接跨用户传播，详见 `trip-system-signals-and-learning-architecture-v1.md`。

不包含：

1. 社交评论与多人协作
2. 海外 provider 正式上线
3. 复杂账号与订阅体系
4. 内容运营后台

---

## 2. 当前基线与已完成基础

以下基础骨架已完成或已具备雏形，本轮不重复作为主目标：

1. App 已收口为 `行程 / AI规划` 双 Tab
2. `MapFlowScreen` 已完成 `entry / generating / result / legacy-planner` 容器编排
3. 已有 `PlanEntryView / DestinationSearchView / DatePickerSheet / GeneratingView / MapResultView / PoiDetailSheet / QuickOptimizeSheet`
4. 旧版 `PlannerScreen` 仍保留，作为深编辑 fallback
5. 保存、分享、已保存路线回看链路已具备基础能力
6. 后端已有：
- `/api/v1/plans/generate`
- `/api/v1/plans/replan`
- `/api/v1/plans/save`
- `/api/v1/share/{token}`
- `/api/v1/destinations/search`

本轮重点不再是“把页面搭出来”，而是把结果从“演示级骨架”升级成“真实可用路线”。

### 2.1 当前交付快照

截至 2026-04-02，主链路里已经完成的关键能力包括：

1. `destinations/resolve`、`plans/brief`、`plans/generate-v2`、`plans/validate`、`places/{provider}/{place_id}` 已落地。
2. 真实 POI / 路线 / 天气已优先走高德事实层，失败时才显式降级。
3. `MapResultView` 已展示来源、校验、社区参考、个性化说明与点位级依据。
4. `TripsScreen` 已接入社区发布、社区详情、创作者公开资料、我的公开分享与私有学习控制。
5. 保存、分享、社区反哺规划、私有信号学习、社区信号解释已形成闭环。

当前这一份 tasklist 的作用，已经从“待开发拆解”变为“主线能力清单 + 后续工程化项跟踪”。

---

## 3. 核心拆分原则

1. 先冻结事实链路，再扩展模型能力。
2. 正式 itinerary 中任何点位都必须可追溯来源。
3. 模型只做理解、重排、解释与追问，不直接发明正式 POI。
4. 所有结果必须经过校验器，降级必须显式。
5. 已经完成的移动端骨架尽量复用，不推倒重做。
6. 优先打通中国大陆主 provider，海外能力只留接口扩展位。

---

## 4. 阶段总览

### Phase 1：真实数据接入

目标：

- 去掉主生成链路对静态样例点位的依赖

### Phase 2：规则排程升级

目标：

- 用真实候选池和规则求解替代固定时间模板拼接

### Phase 3：模型后置接入

目标：

- 让模型负责结构化 brief、候选重排、解释生成与澄清追问

### Phase 4：可信度与评估闭环

目标：

- 让生成结果可验证、可降级、可监控、可持续优化

---

## 5. 客户端任务分解（iOS）

建议主要涉及文件：

- `apps/mobile-ios/App.tsx`
- `apps/mobile-ios/src/api/client.ts`
- `apps/mobile-ios/src/types/plan.ts`
- `apps/mobile-ios/src/types/itinerary.ts`
- `apps/mobile-ios/src/utils/itinerary.ts`
- `apps/mobile-ios/src/screens/TripsScreen.tsx`
- `apps/mobile-ios/src/screens/PlannerScreen.tsx`
- `apps/mobile-ios/src/screens/map/*`

| ID | 阶段 | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|---|
| MOB-RD-01 | Phase 1 | AI 规划页接入结构化目的地实体 | `src/screens/map/PlanEntryView.tsx`, `src/types/plan.ts` | API-RD-01 | 1.5 人日 | 目的地选择后不再只是字符串，客户端能持有 `destination_id/adcode/center_lat/lng/provider` |
| MOB-RD-02 | Phase 1 | 替换旧搜索调用为 `destinations/resolve` | `src/api/client.ts`, `DestinationSearchView.tsx` | API-RD-01 | 1.5 人日 | 搜索返回结构化候选；自定义输入会被标记为 `custom`，不能直接走正式生成 |
| MOB-RD-03 | Phase 1 | 新增 `planning_brief` 组装与提交前校验 | `MapFlowScreen.tsx`, `src/types/plan.ts` | API-RD-02 | 2 人日 | 表单与自然语言补充统一汇聚为 `PlanningBrief`；缺字段时不直接提交生成 |
| MOB-RD-04 | Phase 1 | 生成中页改为真实数据阶段反馈 | `GeneratingView.tsx`, `MapFlowScreen.tsx` | API-RD-03 | 1.5 人日 | 展示 `确认城市 -> 搜索点位 -> 计算路线 -> 生成说明` 四阶段 |
| MOB-RD-05 | Phase 1 | 结果页接入 `source_mode / validation_result / confidence_tier` | `MapResultView.tsx`, `src/types/itinerary.ts`, `src/utils/itinerary.ts` | API-RD-03 | 2 人日 | 页面可读出是否降级、可信度等级和校验状态 |
| MOB-RD-06 | Phase 2 | 结果页展示真实 evidence 信息 | `MapResultView.tsx`, `PoiDetailSheet.tsx` | API-RD-03, API-RD-04 | 2 人日 | 点位详情页可展示 provider、更新时间、上一段路线时间、天气或营业依据 |
| MOB-RD-07 | Phase 2 | 行程卡片与点位详情接入真实替代建议 | `MapResultView.tsx`, `PoiDetailSheet.tsx` | API-RD-03 | 1.5 人日 | 替代建议必须带来源，不再展示无依据备选 |
| MOB-RD-08 | Phase 2 | 保存前接入独立 validate | `MapResultView.tsx`, `src/api/client.ts` | API-RD-05 | 1.5 人日 | 保存前校验失败时不能伪装成功；页面可提示待确认项 |
| MOB-RD-09 | Phase 3 | AI 规划页接入 brief 澄清问答 | `PlanEntryView.tsx`, `MapFlowScreen.tsx`, `src/api/client.ts` | API-RD-02, API-RD-06 | 2 人日 | 输入不完整时可结构化追问，不直接盲生成 |
| MOB-RD-10 | Phase 3 | 结果页解释文案与“为什么选这里”升级 | `MapResultView.tsx`, `PoiDetailSheet.tsx` | API-RD-06 | 1.5 人日 | 推荐理由来自 explain 层，不再混用旧模板文案 |
| MOB-RD-11 | Phase 4 | 可信度与来源标签 UI 收口 | `MapResultView.tsx`, `TripsScreen.tsx`, `src/types/itinerary.ts` | API-RD-05 | 1 人日 | 首屏明确展示 `数据来源 / 可信度 / 是否降级` |
| MOB-RD-12 | Phase 4 | 埋点、异常态、回归收口 | `src/api/client.ts`, `MapFlowScreen.tsx`, `MapResultView.tsx`, `TripsScreen.tsx` | MOB-RD-01~11 | 2 人日 | 关键事件埋点齐全；目的地未确认、provider 超时、校验失败、降级返回都有可恢复提示 |

---

## 6. 后端任务分解（Go）

建议主要涉及文件：

- `apps/trip-api-go/internal/app/server.go`
- `apps/trip-api-go/internal/app/planner.go`
- `apps/trip-api-go/internal/app/planner_mobile_summary.go`
- `apps/trip-api-go/internal/app/types.go`
- `apps/trip-api-go/internal/app/*_test.go`
- 新增建议目录：
- `internal/app/provider/*`
- `internal/app/planner/*`
- `internal/app/cache/*`

| ID | 阶段 | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|---|
| API-RD-01 | Phase 1 | 新增 `destinations/resolve` 与结构化目的地模型 | `server.go`, `types.go`, 新增 `provider/*`, `destination_search.go` | 无 | 2.5 人日 | 返回 `destination_id/destination_label/adcode/city_code/center_lat/lng/provider/provider_place_id` |
| API-RD-02 | Phase 1 | 新增 `plans/brief` 与 `PlanningBrief` 模型 | `server.go`, 新增 `planner/brief.go`, `types.go` | API-RD-01 | 2.5 人日 | 表单与自由文本汇聚为标准化 brief；返回 `missing_fields/ready_to_generate` |
| API-RD-03 | Phase 1 | 新增 `plans/generate-v2` 主链路骨架 | `server.go`, 新增 `planner/retrieval.go`, `planner/scheduler.go`, `planner/validator.go`, `types.go` | API-RD-01, API-RD-02 | 4 人日 | 新链路可基于真实 provider 事实生成 itinerary；返回 `source_mode/degraded/validation_result` |
| API-RD-04 | Phase 1 | 接入 provider cache 与证据对象 | 新增 `cache/provider_cache.go`, `types.go`, `provider/*` | API-RD-01 | 2 人日 | place/route/weather 证据可缓存且具备 `source_fetched_at` |
| API-RD-05 | Phase 2 | 新增独立 `plans/validate` | `server.go`, `planner/validator.go`, `types.go` | API-RD-03 | 2 人日 | 可对 itinerary 独立校验，返回 `passed/issues/coverage/confidence_tier` |
| API-RD-06 | Phase 2 | 点位详情接口 `places/{provider}/{place_id}` | `server.go`, 新增 `provider/place_detail.go`, `types.go` | API-RD-01 | 2 人日 | 点位详情字段稳定，支持详情页直接消费 |
| API-RD-07 | Phase 2 | 规则排程器替换固定模板拼接 | `planner.go`, 新增 `planner/scoring.go`, `planner/scheduler.go` | API-RD-03 | 4 人日 | 不再默认使用固定 `09-11 / 11-13 / 14-17 / 19-21` 模板硬拼点位 |
| API-RD-08 | Phase 2 | 候选池构建与替代建议规则化 | `planner/retrieval.go`, `planner/scoring.go` | API-RD-03 | 2.5 人日 | 替代建议来源于真实候选池，且携带 provider 来源 |
| API-RD-09 | Phase 3 | 模型后置接入：brief 理解与 explain 输出 | 新增 `planner/explainer.go`, `chat.go`, `types.go` | API-RD-02, API-RD-03 | 3 人日 | 模型只输出 schema 化结构和 grounding 文案，不直接生成正式点位 |
| API-RD-10 | Phase 3 | 候选重排与澄清问答接口升级 | `chat.go`, `planner/brief.go`, `planner/explainer.go` | API-RD-09 | 2.5 人日 | 缺字段时返回澄清问答；候选排序受用户语义偏好影响 |
| API-RD-11 | Phase 4 | 错误模型、降级语义与 `degraded_reason` 收口 | `server.go`, `types.go` | API-RD-03, API-RD-05 | 1.5 人日 | provider 超时、覆盖率不足、校验失败等都有稳定错误码或降级原因 |
| API-RD-12 | Phase 4 | 评估埋点与幻觉监控指标 | `server.go`, `store.go`, 新增 `planner/metrics.go` | API-RD-03~11 | 2 人日 | 输出 `provider_grounded_block_rate/route_evidence_coverage/must_go_hit_rate/hallucinated_place_rate` 等指标 |
| API-RD-13 | Phase 4 | 单测、契约冻结与兼容回归 | `internal/app/*_test.go` | API-RD-01~12 | 3 人日 | `go test ./...` 全通过；新旧生成链路可并行；旧客户端不阻断 |

---

## 7. 模型协作任务分解

说明：

- 本轮不把模型当作“主规划器”
- 模型只作为 `brief 理解 / 候选重排 / 解释生成 / 澄清追问` 的协作层

| ID | 阶段 | 任务 | 输出 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|---|
| LLM-RD-01 | Phase 3 | 定义 `PlanningBrief` schema 与 prompt contract | schema + prompt spec | API-RD-02 | 1.5 人日 | 模型输出字段与 API 契约完全对齐 |
| LLM-RD-02 | Phase 3 | 定义 explain schema 与 grounding 规则 | schema + prompt spec | API-RD-09 | 1.5 人日 | 推荐理由只能引用已验证字段 |
| LLM-RD-03 | Phase 3 | 定义澄清问答策略 | prompt spec | API-RD-10 | 1 人日 | 只在关键信息缺失时追问，不重复问已确认字段 |
| LLM-RD-04 | Phase 4 | 建立 hallucination review 样本集 | 评估样本 | API-RD-12 | 2 人日 | 能对“无来源点位、编造营业时间、错误路线解释”做定向回归 |

---

## 8. 阶段推进建议

### Phase 1：真实数据接入

- MOB-RD-01 AI 规划页接入结构化目的地实体
- MOB-RD-02 替换旧搜索调用为 `destinations/resolve`
- MOB-RD-03 新增 `planning_brief` 组装与提交前校验
- MOB-RD-04 生成中页改为真实数据阶段反馈
- API-RD-01 新增 `destinations/resolve`
- API-RD-02 新增 `plans/brief`
- API-RD-03 新增 `plans/generate-v2` 主链路骨架
- API-RD-04 provider cache 与证据对象

目标：

- 用户的目的地和核心约束能被结构化
- 新生成链路可返回带来源的基础 itinerary

### Phase 2：规则排程升级

- MOB-RD-05 结果页接入 `validation_result`
- MOB-RD-06 结果页展示真实 evidence 信息
- MOB-RD-07 替代建议规则化展示
- MOB-RD-08 保存前接入 validate
- API-RD-05 独立 `plans/validate`
- API-RD-06 点位详情接口
- API-RD-07 规则排程器替换固定模板
- API-RD-08 候选池与替代建议规则化

目标：

- 结果页看到的不再只是“像 AI 的文案”
- 每个正式点位都可验证

### Phase 3：模型后置接入

- MOB-RD-09 AI 规划页接入 brief 澄清问答
- MOB-RD-10 结果页解释文案升级
- API-RD-09 模型后置接入：brief 理解与 explain 输出
- API-RD-10 候选重排与澄清问答接口升级
- LLM-RD-01~03 全部推进

目标：

- 模型开始提升体验，但不接管事实层

### Phase 4：可信度与评估闭环

- MOB-RD-11 可信度与来源标签 UI 收口
- MOB-RD-12 埋点、异常态、回归收口
- API-RD-11 错误模型与降级语义收口
- API-RD-12 评估埋点与幻觉监控指标
- API-RD-13 单测与契约冻结
- LLM-RD-04 幻觉回归样本集

目标：

- 结果可解释、可监控、可持续优化

---

## 9. 联调检查点

| 检查点 | 阶段 | 验收内容 |
|---|---|---|
| RD-L1 | Phase 1 周中 | `destinations/resolve` 返回稳定结构化城市实体，客户端可正确回填 |
| RD-L2 | Phase 1 周末 | `plans/brief` 可稳定生成 `PlanningBrief`，缺字段时返回明确澄清状态 |
| RD-L3 | Phase 1 周末 | `plans/generate-v2` 返回 `source_mode/degraded/validation_result`，客户端可解析 |
| RD-L4 | Phase 2 周中 | 每个正式 block 都带 `provider_place_id`、坐标和来源时间 |
| RD-L5 | Phase 2 周末 | `plans/validate` 可识别来源缺失、路线缺失、must-go 未覆盖等问题 |
| RD-L6 | Phase 3 周中 | brief 理解和 explain 输出均为 schema 化结构，无自由文本直接入正式结果 |
| RD-L7 | Phase 3 周末 | 模型可做澄清追问和解释生成，但不会引入无来源点位 |
| RD-L8 | Phase 4 周中 | 页面已展示 `数据来源 / 可信度 / 是否降级`，关键埋点可回流 |
| RD-L9 | 发布前 | `go test ./...`、移动端类型检查、关键回归样本、降级场景验证全部通过 |

---

## 10. 关键依赖说明

### 10.1 强依赖

1. MOB-RD-01、02 依赖 API-RD-01。
2. MOB-RD-03、09 依赖 API-RD-02。
3. MOB-RD-04、05 依赖 API-RD-03。
4. MOB-RD-06、07 依赖 API-RD-06。
5. MOB-RD-08、11 依赖 API-RD-05、11。
6. Phase 3 的模型任务依赖 Phase 1、2 的事实层与规则层先稳定。

### 10.2 可并行项

1. API-RD-01 与客户端目的地选择 UI 可并行。
2. API-RD-04 provider cache 可与 API-RD-03 并行。
3. API-RD-06 点位详情接口可与 API-RD-05 validate 并行。
4. LLM-RD-01 prompt/schema 设计可在 Phase 2 末提前启动。

---

## 11. 关键风险与应对

- 风险：第三方 provider 成本和调用频次显著提升。  
- 应对：先做 cache，再做批量 route matrix 和详情裁剪，避免每次全量请求。

- 风险：真实数据链路增加后，生成时延变长，用户体感下降。  
- 应对：生成中页必须阶段化；检索、路线和天气优先并行；允许短路返回“待确认草案”。

- 风险：模型输出仍可能扩写不存在的事实。  
- 应对：所有模型输出必须走 schema；任何文本在进入正式字段前都通过 grounding 校验。

- 风险：客户端和后端字段定义不一致，导致大量兜底分支。  
- 应对：以 [trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md) 作为唯一联调基线。

- 风险：旧版 `/plans/generate` 与新版 `/plans/generate-v2` 长期并存，维护成本增加。  
- 应对：明确迁移顺序和 `source_mode = rules_legacy` 标记，逐步压缩旧链路使用范围。

---

## 12. 发布前验收清单

### 客户端

- AI 规划页提交前已确认结构化目的地，不再把偏好和城市混填。
- 生成中页明确展示真实数据检索和计算过程。
- 地图结果页可看到 `数据来源 / 可信度 / 是否降级`。
- 点位详情可展示 provider、更新时间、上一段路线时间、天气或营业依据。
- 校验失败时不能直接假装“已生成正式路线”。

### 后端

- 新链路 `generate-v2` 在主要城市场景可稳定返回带来源的 block。
- `validate` 能识别来源缺失、路线缺失、天气缺失、must-go 未命中等问题。
- 所有正式 block 都包含 `provider_place_id`。
- 降级场景统一返回 `degraded` 与 `degraded_reason`。
- `go test ./...` 全通过，新旧链路可并行。

### 模型与质量

- 模型输出不直接生成正式 POI。
- explain 文案引用的字段都能在 evidence 中找到来源。
- 关键指标可采集：
- `provider_grounded_block_rate`
- `route_evidence_coverage`
- `weather_evidence_coverage`
- `must_go_hit_rate`
- `hallucinated_place_rate`

---

## 13. 决策结论

这份任务清单的核心不再是“再补几个页面”，而是完成一次生成链路换心：

1. 从样例数据切到真实数据
2. 从模板拼接切到规则排程
3. 从模型可能乱写切到模型后置
4. 从黑盒结果切到有来源、有证据、有校验的正式路线

只要按这个清单推进，后续无论做高可信路线、半自动确认、模型解释增强还是海外扩展，都会落在一个更稳的事实型基础设施上。
