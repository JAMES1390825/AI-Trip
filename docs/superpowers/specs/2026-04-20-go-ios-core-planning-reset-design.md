# Go 单后端与 iOS 核心规划主线重置设计

- 日期：2026-04-20
- 状态：Approved for planning
- 适用范围：`docs/`、`apps/trip-api-go`、`apps/mobile-ios`、仓库主线边界
- 关联文档：
  - `README.md`
  - `docs/README.md`
  - `docs/adr/ADR-001-tech-stack-and-boundaries.md`
  - `docs/product/README.md`
  - `docs/product/trip-system-signals-and-learning-architecture-v1.md`
  - `docs/product/trip-personal-and-community-prd-v1.md`
  - `docs/product/trip-mobile-real-data-architecture-v1.md`
  - `docs/product/trip-mobile-real-data-api-contract-v1.md`

## 1. 背景

当前仓库的主线历史上已经扩展出多条并行主题：

1. 真实地图事实驱动规划
2. 个人私有学习信号
3. 社区分享与社区信号反哺
4. 独立 Python AI service
5. iOS 用户端
6. Web Admin

这些主题分别沉淀在 `docs/product` 中的多份 PRD、架构文档、tasklist 和 API 文档里。虽然文档本身并不混乱，但当前维护成本过高，已经不再适合新的产品方向。

新的方向有三个关键判断：

1. 当前产品主线应收缩为：`AI 行程规划 + 保存/回看`
2. 运行单元应收缩为：`Go 单后端 + iOS App`
3. 社区、个人化学习、独立 Python AI service 和 Web 端都不再属于当前主线

因此这轮不是“在旧文档基础上增量修补”，而是：

`保留极少数必要背景，重置文档体系与产品主线`

## 2. 目标

本轮设计目标是为下一阶段实现提供一套新的、足够小且足够清晰的系统定义。

具体目标：

1. 用新的主 PRD 替代当前分散的产品文档主线
2. 把系统边界重定义为：`Go 单后端 + iOS App`
3. 明确独立 Python AI service、Web 端、社区和个人化学习不再属于当前主线
4. 把 `docs/product` 收缩为一套新的最小文档集合
5. 为后续“AI 能力并入 Go”与“删除旧资产”提供顺序明确的实施入口

## 3. 新的产品主线

### 3.1 当前主线

新的当前产品主线只有：

`AI 行程规划 + 保存/回看`

产品应围绕以下最小闭环定义：

1. 用户在 iOS App 输入出发地、目的地、天数、日期、预算、节奏等信息
2. 系统返回一个可解释、可保存、可回看的 itinerary
3. 用户可以在服务端保存 itinerary，并在后续重新打开查看
4. 换设备后仍然可以通过服务端找回保存内容

### 3.2 明确移除的主题

以下内容不再属于当前产品主线：

1. 社区分享
2. 社区参考与社区信号反哺
3. 个人私有学习
4. 个人画像与个性化排序
5. 独立 Python AI service
6. Web 端运维/调试台

这些内容在新的 PRD 中不作为 roadmap 保留，而是明确写成：

`已从当前主线移除，未来若重启，需以新的独立专题重新立项`

## 4. 方案对比

### 4.1 方案 A：直接清空文档后重写

优点：

1. 最干净
2. 不受旧结构影响

缺点：

1. 会短时间失去所有背景信息
2. 容易在新 PRD 未定稿前陷入无锚点讨论
3. 风险过高

### 4.2 方案 B：最小背景保留 + 主线重写

优点：

1. 能保留必要技术边界与历史背景
2. 能快速建立新主线的唯一真相
3. 最符合“只保留极少数必要背景，其余清空重写”的目标

缺点：

1. 需要先明确哪些文档属于“极少数必要背景”
2. 需要在删除与重写之间保持顺序纪律

### 4.3 方案 C：旧文档降级保留

优点：

1. 风险最小

缺点：

1. 无法真正降低维护成本
2. 旧主线仍会继续干扰新主线

### 4.4 结论

采用方案 B：`最小背景保留 + 主线重写`

## 5. 新的系统边界

### 5.1 运行单元

新的系统只保留两个运行单元：

1. `iOS App`
2. `Go 后端`

### 5.2 iOS App 的职责

iOS App 是唯一用户端，负责：

1. 采集用户输入
2. 展示 itinerary 结果
3. 触发保存/回看
4. 与 Go 后端通信

iOS App 不再承担：

1. 社区功能
2. 独立前台 Web 对齐
3. 服务端真值逻辑
4. 模型密钥保管

### 5.3 Go 后端的职责

Go 后端是唯一服务端，负责：

1. 认证或设备身份
2. 规划请求编排
3. provider / model 调用
4. itinerary 校验与降级语义
5. 保存与回看持久化
6. 后续多设备恢复能力

### 5.4 模型能力的形态

模型能力仍然保留，但部署形态改变：

1. 不再作为独立 Python 服务存在
2. 迁入 Go 后端内部模块

新的模型能力定位是：

1. brief enhance
2. chat/intake enhance
3. itinerary explain

它们属于 Go 后端内部的适配层或服务模块，而不是独立进程。

### 5.5 Web 的结论

Web 端不再保留。

理由：

1. 当前唯一用户端已经收敛到 iOS
2. 调试/运维收益不足以支撑继续保留独立 Web 应用
3. 当前目标是减少运行时和资产数量，而不是保留内部工具

## 6. 新的最小文档集合

### 6.1 保留文档

重置后 `docs/` 只保留以下类型：

1. 总入口文档
   - `docs/README.md`
2. 技术边界 ADR
   - `docs/adr/ADR-001-tech-stack-and-boundaries.md`
3. 新的主 PRD
   - `docs/product/trip-core-planning-prd.md`
4. 新的核心架构文档
   - `docs/product/trip-core-planning-architecture.md`
5. 新的 API 文档
   - `docs/product/trip-core-planning-api.md`
6. 新的任务清单
   - `docs/product/trip-core-planning-tasklist.md`

### 6.2 删除或退出主线的文档

以下旧产品文档不再保留为当前主线文档，应删除或被新文档替换：

1. `docs/product/trip-system-signals-and-learning-architecture-v1.md`
2. `docs/product/trip-personal-and-community-prd-v1.md`
3. `docs/product/trip-user-private-signals-prd-v1.md`
4. `docs/product/trip-user-private-signals-tasklist-v1.md`
5. `docs/product/trip-community-tasklist-v1.md`
6. `docs/product/trip-community-governance-prd-v1.md`
7. `docs/product/trip-mobile-real-data-architecture-v1.md`
8. `docs/product/trip-mobile-real-data-api-contract-v1.md`
9. `docs/product/trip-mobile-wireframes-v2.md`
10. `docs/product/trip-mobile-v2-tasklist.md`
11. `docs/product/current-doc-set.md`
12. `docs/product/README.md` 当前内容

### 6.3 指标文档

`docs/metrics` 是否保留，不在本轮主目标中。

建议：

1. 暂时保留
2. 但不纳入新的主阅读路径

## 7. 新 PRD 的最小结构

新的主 PRD `trip-core-planning-prd.md` 建议覆盖：

1. 目标用户
2. 核心问题
3. 关键用户旅程
4. 输入项
5. 输出项
6. 保存/回看机制
7. 当前不做什么
8. 成功标准

明确不写入：

1. 社区路线分享
2. 个人学习信号
3. 个性化排序
4. Web 用户体验
5. 独立 AI service 边界

## 8. 后续 Go 统一方向

### 8.1 技术决策

在不考虑当前改动成本时，新的后端语言选择应统一到 Go，而不是 Java、Python、Node 或 C++。

理由：

1. 当前系统是单后端、高并发、模型编排与保存/回看场景
2. Go 对这类 API / 编排 / 限流 / 超时 / 降级服务的复杂度更匹配
3. 相比 Java，更轻
4. 相比 Python，更适合长期线上主后端
5. 相比 Node，更适合作为唯一服务端真值层
6. 相比 C++，工程成本更合理

### 8.2 新的技术边界

新的 ADR 应明确：

1. Go 是唯一后端语言
2. 模型能力在 Go 内部封装
3. iOS 是唯一客户端
4. Web 与 Python AI service 退出当前主线

## 9. 实施顺序

严格建议按以下顺序执行：

1. 重写新的主 PRD
2. 重写新的 ADR
3. 重写新的架构/API/tasklist 文档
4. 删除旧产品文档
5. 设计 Python AI service 并入 Go 的模块方案
6. 写迁移实施 plan
7. 再动代码
8. 在 Go 侧能力对齐后，删除 `apps/trip-ai-service`
9. 删除 `apps/web-client`

## 10. 风险与约束

### 10.1 风险

1. 先删旧文档再写新文档，会造成无锚点状态
2. 先删 Python service 再设计 Go 迁移，会导致能力空窗
3. 先删 Web 再决定内部调试需求，可能造成排障入口缺失

### 10.2 控制原则

1. 新文档先写、旧文档后删
2. Go 迁移方案先定、Python service 后删
3. 当前主线只允许一套文档真相

## 11. 成功标准

本轮设计完成后的成功标准是：

1. 新主线被清晰定义为 `AI 行程规划 + 保存/回看`
2. 系统边界被清晰定义为 `Go 单后端 + iOS App`
3. Web、Python AI service、社区、个人化学习被明确移出当前主线
4. `docs/product` 新文档集合被压缩为少数核心文档
5. 后续能够基于这套定义写出明确的实施计划，而不是继续围绕旧文档修补

## 12. 设计结论

新的仓库主线应重置为：

`Go 单后端 + iOS App + AI 行程规划 + 服务端保存/回看`

这意味着：

1. 文档体系需要重置
2. 产品主线需要重写
3. 独立 Python AI service 需要并入 Go
4. Web 端需要下线
5. 当前主线不再承载社区与个人化学习主题
