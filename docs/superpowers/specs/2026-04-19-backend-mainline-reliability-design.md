# 后端主链路可靠性收口设计

- 日期：2026-04-19
- 状态：Approved for planning
- 适用范围：`apps/trip-api-go`
- 关联文档：
  - `README.md`
  - `docs/adr/ADR-001-tech-stack-and-boundaries.md`
  - `docs/product/trip-system-signals-and-learning-architecture-v1.md`
  - `docs/product/trip-mobile-v2-tasklist.md`
  - `docs/product/trip-user-private-signals-tasklist-v1.md`
  - `docs/product/trip-community-tasklist-v1.md`

## 1. 背景

当前仓库的产品主线已经收口为：

`Go 后端事实与业务真值 + Python AI service 后置增强 + iOS 主产品入口 + Web Admin 运维联调`

在这个边界下，`apps/trip-api-go` 已经承担：

1. 目的地标准化
2. Planning brief 组装
3. `generate-v2` 行程生成
4. `validate` 校验
5. 保存与分享
6. 事件写入
7. 私有画像与社区信号的在线接入

当前后端方向本身是成立的，但主链路可靠性规则仍然分散在多个大文件中：

1. 路由与 handler 分发集中在 `internal/app/server.go`
2. itinerary 可靠性元数据集中但不完全统一地分布在 `planner_v2.go`、`planner_provider_grounding.go`、`planner_validation.go`
3. 顶层接口成功语义、错误语义、降级语义没有被显式冻结为单一契约
4. 主链 smoke 和接口级回归保护还不够集中

因此本轮不应定义为“大重构”或“新增功能”，而应定义为：

`后端主链路可靠性收口`

## 2. 目标

本轮目标是为后端主链建立稳定、可断言、可回归的契约与验证层，而不是继续扩张功能面。

具体目标：

1. 收口主链接口的成功响应不变量、错误码和降级语义
2. 把 itinerary 顶层可靠性字段收口为稳定规则，而不是分散在 handler 和 planner 逻辑中临时拼接
3. 为主链建立可重复执行的 smoke 路径
4. 在不大改客户端契约的前提下，允许中度统一错误/降级语义
5. 不让社区、私有信号和已保存计划相关能力被这轮改动回归破坏

## 3. 范围

### 3.1 In Scope

本轮主目标覆盖以下主链接口：

1. `POST /api/v1/auth/token`
2. `GET /api/v1/destinations/resolve`
3. `POST /api/v1/plans/brief`
4. `POST /api/v1/plans/generate-v2`
5. `POST /api/v1/plans/validate`
6. `POST /api/v1/plans/save`
7. `POST /api/v1/events`

本轮还包括：

1. 主链 handler 拆分与职责收口
2. itinerary 可靠性元数据统一补齐
3. 主链契约测试、语义测试和 smoke 脚本收口
4. 主链验证入口相关文档更新

### 3.2 Out of Scope

本轮明确不做：

1. 新增产品功能
2. 全量 package 级重构
3. 存储层迁移
4. 社区治理/媒体链路专项工程化
5. 私有画像逻辑重写
6. iOS 或 Web 客户端契约大改

社区与私有信号能力本轮仅作为：

1. 不被回归破坏的边界能力
2. 主链事件与 itinerary 元数据的依赖校验对象

## 4. 约束

本轮工作遵循以下约束：

1. 优先后端主链可靠性，不扩散到整个仓库工程治理
2. 允许中度收口错误码、降级语义和返回结构，但不重写客户端消费方式
3. 以“行为可验证”为优先，不以“文件更好看”为完成标准
4. 优先文件级拆分，不做过度 package 化
5. 对现有社区和私有信号字段保持兼容

## 5. 方案对比

### 5.1 方案 A：保守型收口

只补测试、smoke、文档和少量内部整理，不碰错误/降级语义。

优点：

1. 改动风险最低
2. 对现有客户端最保守

缺点：

1. 关键可靠性语义仍然分散
2. 很多真实风险继续保留在运行时细节中
3. 这一轮收益不足以支撑后续功能继续叠加

### 5.2 方案 B：主链可靠性收口

围绕主链接口收口成功响应不变量、错误语义、降级语义、测试和 smoke，同时做必要的文件级拆分。

优点：

1. 收益与风险最平衡
2. 能显著降低后续主链改动的回归成本
3. 不需要等待大规模重构就能获得稳定契约

缺点：

1. 需要在兼容性和一致性之间做取舍
2. 会触达主链热点文件

### 5.3 方案 C：重构优先

先大拆 `server.go`、`planner.go`、`store.go`，再谈可靠性。

优点：

1. 长期结构最干净

缺点：

1. 本轮投入与目标不匹配
2. 容易把时间花在结构美化而非主链稳定性上
3. 风险高于当前阶段所需

### 5.4 结论

采用方案 B：`主链可靠性收口`

## 6. 目标架构

### 6.1 总体原则

不改变 `App` 作为组合根的结构，但将主链职责从“大一统 server 文件”中收口成更小的实现单元。

### 6.2 文件级拆分策略

建议新增或整理为以下文件边界：

1. `server.go`
   - 仅保留：`App` 初始化、`ServeHTTP` 总入口、CORS、认证、顶层 dispatch
2. `server_mainline.go`
   - 主链 handler：`resolve`、`brief`、`generate-v2`、`validate`、`save`、`events`
3. `server_saved_plans.go`
   - 已保存计划相关 handler
4. `server_community.go`
   - 社区相关 handler
5. `server_profile.go`
   - 私有画像、个性化设置相关 handler
6. `server_admin.go`
   - 管理员接口 handler
7. `routes_parse.go`
   - 路径解析 helpers

### 6.3 主链契约层

主链新增一组共享契约与可靠性 helpers，建议放在以下文件中：

1. `mainline_requests.go`
2. `mainline_responses.go`
3. `mainline_errors.go`
4. `mainline_reliability.go`

这些文件的职责不是抽象业务，而是冻结主链的：

1. 输入校验规则
2. 成功响应不变量
3. 错误码
4. 降级原因
5. itinerary 可靠性字段补齐规则

## 7. 主链数据流

### 7.1 认证

`POST /api/v1/auth/token`

职责：

1. 只建立认证上下文
2. 不掺入业务可用性语义

### 7.2 目的地标准化

`GET /api/v1/destinations/resolve`

职责：

1. 把自由输入收口成结构化目的地实体
2. 为后续主链提供 `destination entity`

语义：

1. 只要请求参数合法，即返回 `200`
2. `items` 允许为空
3. `degraded=true` 表示 provider 命中不足或退回到降级匹配，不表示接口失败

### 7.3 Brief 组装

`POST /api/v1/plans/brief`

职责：

1. 把目的地、日期、天数、预算、节奏和自由文本约束收口成 `PlanningBrief`
2. 作为主链“是否可生成”的唯一判定口

语义：

1. `ready_to_generate=false` 是正常业务状态，不是错误
2. 缺字段通过 `missing_fields`、`next_action`、`clarification_question` 表达
3. 不因为“信息不足”返回 `400`

### 7.4 Itinerary 生成

`POST /api/v1/plans/generate-v2`

职责：

1. 生成 itinerary
2. 为结果附加统一的可靠性元数据

语义：

1. 输入不合法、brief 未就绪时返回 `4xx`
2. 调用方显式 `allow_fallback=false` 且结果仍需降级时返回 `PROVIDER_COVERAGE_LOW`
3. 若返回 `200`，每个 itinerary 必须补齐统一的可靠性字段

### 7.5 独立校验

`POST /api/v1/plans/validate`

职责：

1. 独立评估 itinerary 可靠性
2. 为生成后校验、保存前复核和回放验证提供统一输出

语义：

1. payload 格式错才返回 `400`
2. `validation_result.passed=false` 仍然是 `200`
3. `validate` 是评估器，不把“不理想结果”混成请求失败

### 7.6 保存

`POST /api/v1/plans/save`

职责：

1. 接收已具备标准可靠性元数据的 itinerary
2. 先 refresh/normalize，再做 dedupe 与持久化
3. 打出保存相关事件

语义：

1. 本轮不增加“必须 validation passed 才能保存”的强门槛
2. 继续保留 dedupe 行为
3. 继续保证只能保存当前用户自己的 itinerary

### 7.7 事件

`POST /api/v1/events`

职责：

1. 作为主链审计尾部写路径
2. 记录主链关键节点

语义：

1. 客户端显式调用失败时应返回错误
2. 服务端内部 `trackEvent(...)` 继续保持 fail-soft，不反向拖垮主链

## 8. 可靠性语义设计

### 8.1 统一结果类型

本轮将主链结果稳定为三类：

1. 请求错误
   - 返回 `4xx/5xx`
   - 统一使用现有 `error / message / timestamp`
2. 成功但降级
   - 返回 `200`
   - 必须显式携带 `degraded=true`
3. 成功但校验未通过
   - 返回 `200`
   - 通过 `validation_result.passed=false` 表达

### 8.2 冻结的 itinerary 顶层可靠性字段

对于 `generate-v2` 成功返回的 itinerary，至少保证以下字段被统一补齐：

1. `source_mode`
2. `degraded`
3. `degraded_reason`
4. `validation_result`
5. `confidence`

### 8.3 冻结的 `degraded_reason`

本轮只冻结并统一使用以下少数值：

1. `provider_coverage_low`
2. `validation_not_passed`
3. `destination_custom_unresolved`

不在主链中继续引入新的随意字符串。

### 8.4 统一可靠性补齐步骤

主链内部新增一个共享的 reliability envelope 步骤，负责：

1. 刷新 itinerary 请求快照与 `planning_brief`
2. 补齐 `source_mode / degraded / degraded_reason`
3. 生成或刷新 `validation_result`
4. 衍生 `confidence`
5. 确保保存前与返回前的元数据格式一致

该步骤必须成为：

1. `generate-v2` 返回前的唯一补齐入口
2. `save` 持久化前的标准化入口

## 9. 测试与验证策略

### 9.1 契约级测试

为以下接口补齐输入校验、成功响应不变量、错误码和降级原因断言：

1. `auth/token`
2. `destinations/resolve`
3. `plans/brief`
4. `plans/generate-v2`
5. `plans/validate`
6. `plans/save`
7. `events`

### 9.2 语义级测试

为以下规则单独补测试：

1. `degraded_reason` 推导
2. `validation_result` 稳定输出
3. `confidence_tier`/`confidence` 推导
4. save 前 refresh/normalize 不变量

### 9.3 主链 smoke

新增或收口一条后端主链 smoke：

`auth -> resolve -> brief -> generate-v2 -> validate -> save -> events`

再补两条异常路径 smoke：

1. `brief incomplete`
2. `allow_fallback=false + degraded result`

### 9.4 回归保护

社区与私有信号不作为本轮主目标，但必须确保：

1. `community_post_ids` 透传不丢失
2. `community_reference_summary` 不被主链收口破坏
3. `plan_saved` 事件元数据保持兼容
4. 个人画像写路径不被事件语义改动破坏

## 10. 成功标准

本轮完成标准不是“看起来更整洁”，而是：

1. 主链接口都有明确的成功响应不变量、错误码和降级语义
2. `generate-v2` 和 `validate` 的失败/降级原因可被稳定断言
3. 有可重复执行的主链 smoke
4. `go test ./...` 保持通过
5. 主链改动不破坏社区和私有信号当前闭环
6. 保存后的 itinerary 可靠性元数据格式保持一致

## 11. 实施顺序

建议按以下顺序推进：

1. 冻结主链契约
   - 列出输入、成功响应不变量、错误码、降级原因和事件名
2. 抽出共享 reliability envelope
   - 收口 itinerary 可靠性字段补齐
3. 整理主链 handlers
   - 先拆主链，不碰社区和 admin 主逻辑
4. 补契约测试与语义测试
5. 收口 smoke 脚本
6. 最后更新 README 或相关文档中的主链验证入口

## 12. 风险与非目标

### 12.1 主要风险

1. 为统一语义而误伤现有客户端的宽松兼容行为
2. 对热点文件收口时引入无意的主链回归
3. 保存前标准化若处理不当，可能影响 dedupe 结果

### 12.2 缓解方式

1. 先冻结契约，再改实现
2. 以测试和 smoke 驱动收口，不先做大规模机械拆分
3. 社区与私有信号保留回归保护测试

### 12.3 非目标重申

本轮不是：

1. 社区工程化专题
2. 个性化收益优化专题
3. 存储升级专题
4. 全仓库统一重构专题

## 13. 设计结论

本轮采用：

`后端主链路可靠性收口`

它的本质是：

1. 冻结主链契约
2. 收口 itinerary 可靠性元数据
3. 整理主链 handler 边界
4. 用测试和 smoke 建立稳定回归网

在这个基础上，后续再推进私有学习信号深化或社区深化，才不会继续放大当前的主链回归风险。
