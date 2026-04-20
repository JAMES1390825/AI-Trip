# Core Line Purification Design

- 日期：2026-04-20
- 状态：Drafted for review
- 适用范围：`apps/trip-api-go`、`apps/mobile-ios`、`docs/`、`scripts/`
- 关联文档：
  - `docs/product/trip-core-planning-prd.md`
  - `docs/product/trip-core-planning-architecture.md`
  - `docs/product/trip-core-planning-api.md`
  - `README.md`
  - `apps/trip-api-go/README.md`

## 1. 背景

上一轮主线重置已经把仓库文档和运行边界定义为：

`Go backend + iOS app + AI planning + save/review`

并且明确把以下主题退出当前主线：

1. 社区
2. 个人化学习 / 私有信号
3. 独立 Python AI service
4. Web runtime
5. `share` 公开分享链路

但当前代码库仍然存在明显的边界不一致：

1. 产品 API 文档只保留 core line active endpoints
2. 后端仍暴露 community / admin / profile / share / old planner 相关路由
3. iOS 当前主链仍可回退到 legacy planner，并继续调用旧 `generate`、`replan`、`chat/intake`
4. `Store` 仍持有社区、个性化、share 等已退役状态与持久化结构
5. README、服务说明、脚本和 smoke 还残留旧产品线描述

因此当前最需要解决的不是“新增能力”，而是：

`把实际运行系统真正纯化到当前定义的 core line`

## 2. 目标

本轮目标是把仓库和运行系统真正收口为：

`AI planning + save/review only`

具体目标：

1. 冻结并落实当前主线 active API boundary
2. 删除后端中所有已退役公开路由和对应处理链
3. 删除 iOS 对 legacy planner 和旧 API 的依赖
4. 删除 store 中已退役产品线状态与持久化字段
5. 让 README、API 文档、脚本、smoke 与当前主线完全一致

## 3. 非目标

本轮明确不做：

1. 身份体系重做
2. 跨设备恢复实现
3. 引入新的数据库或存储后端
4. 新增产品功能
5. 为已退役能力提供过渡兼容协议

## 4. 设计约束

本轮遵循以下约束：

1. 当前唯一产品线仍是 `AI planning + save/review`
2. 已退役能力不作为“隐藏但保留”的灰色状态存在
3. 旧本地数据不做兼容迁移
4. 优先保证边界纯化和系统自洽，而不是追求最少删除量
5. 每一层收口后都必须有对应验证，而不是一次性大改后再整体找问题

## 5. 方案对比

### 5.1 方案 A：激进裁剪

一次性删除后端所有社区、个性化、share、旧 generate/replan、legacy planner、旧 store 字段和相关测试。

优点：

1. 最干净
2. 理论上的最终状态最接近目标

缺点：

1. 改动面过大
2. 回归定位困难
3. 容易在一轮里同时打碎路由、数据层和客户端链路

### 5.2 方案 B：分层纯化

先冻结 active boundary，再按：

`路由层 -> iOS 调用层 -> store/state -> 测试/文档`

的顺序逐层收口。

优点：

1. 风险最低
2. 每一步的验证点明确
3. 最适合当前已运行但边界不一致的仓库状态

缺点：

1. 会产生少量中间提交
2. 不是“一刀切”

### 5.3 方案 C：兼容外壳

表面隐藏旧能力，只把旧接口标为 deprecated，内部数据和实现先保留。

优点：

1. 短期实现最快

缺点：

1. 技术债继续保留
2. 文档与运行边界仍长期不一致
3. 后续删除成本更高

### 5.4 结论

采用方案 B：

`分层纯化`

## 6. 目标边界

### 6.1 后端 active public endpoints

收口完成后，后端只保留这些对当前 iOS 主线有意义的公开接口：

1. `GET /api/v1/health`
2. `POST /api/v1/auth/token`
3. `GET /api/v1/destinations/resolve`
4. `POST /api/v1/plans/brief`
5. `POST /api/v1/plans/generate-v2`
6. `POST /api/v1/plans/validate`
7. `POST /api/v1/plans/save`
8. `GET /api/v1/plans/saved`
9. `GET /api/v1/plans/saved/:id`
10. `DELETE /api/v1/plans/saved/:id`

其中：

1. `health` 仅保留为运行健康检查接口
2. 产品主链仍然是 `auth -> resolve -> brief -> generate-v2 -> validate -> save -> saved-list/detail/delete`

### 6.2 明确退役的后端公开能力

本轮明确退役以下能力：

1. `share` 全链路
2. `community` 全链路
3. `profile/private-*`
4. `admin/*`
5. 旧 `plans/generate`
6. `plans/replan`
7. `plans/revert`
8. 公开分享读取路由
9. `POST /api/v1/events`
10. 任何只为上述能力存在的 helper、response shaping、event metadata 和 README 描述

### 6.3 iOS active surfaces

收口完成后，iOS 端只保留：

1. `TripsScreen`
   - 列表查看已保存 itinerary
   - 打开 saved detail
   - 删除 saved itinerary

2. `MapFlowScreen`
   - 输入规划条件
   - 目的地确认
   - brief
   - `generate-v2`
   - 进入结果页

3. `MapResultView`
   - 查看 itinerary
   - 校验后保存
   - 导航

### 6.4 明确退役的 iOS 行为

本轮明确删除或下线：

1. `legacy planner` 作为当前主链入口或回退页的角色
2. `编辑路线` 入口
3. `AI 优化` 入口
4. 借 `chat/intake` 做结果页问答的入口
5. 对旧 `generate`、`replan`、`chat/intake` 的当前主链依赖

### 6.5 核心原则

本轮遵循的核心原则是：

`先保证当前主线“纯”和“自洽”，再考虑把编辑/优化能力用新的 core API 重新引回。`

## 7. 数据层与清理策略

### 7.1 Store 收口方向

`Store` 直接收口为 save/review-only。

保留：

1. `savedByUser`
2. `savedByID`

删除：

1. `shareByToken`
2. `sharesByPlan`
3. `versionsByPlan`
4. `events`
5. `profilesByUser`
6. `personalizationByUser`
7. `communityPostsByID`
8. `communityVotesByPost`
9. `communityReportsByPost`
10. `communityModerationByPost`
11. 与以上状态对应的：
   - clone helpers
   - persist / restore 逻辑
   - error constants
   - summary helpers
   - moderation helpers
   - reference aggregation helpers

### 7.2 本地数据文件策略

本轮不做 schema 迁移器，也不做兼容读取。

处理策略：

1. 直接把 store 序列化结构改成新的最小集合
2. 旧 `tmp/data/trip-api-go-store.json` 视为无效开发态数据
3. 在 README 和脚本中明确说明：
   - 旧数据文件需要删除
   - 或允许被新结构覆盖

### 7.3 旧数据处理原则

因为本轮选择的是：

`直接删旧字段 / 旧数据`

所以这次不保证旧社区、旧个性化、旧 share、本地旧 saved extension 数据继续可读。

## 8. 错误语义

本轮不做“兼容外壳”或 “deprecated but still alive” 过渡层。

统一策略：

1. 已退役路由不再注册
2. 请求命中这些路径时返回现有 `NOT_FOUND`
3. 不新增专门的 `deprecated` 协议语义
4. 不保留“后端还在、客户端别调”的灰色状态

这样做的原因是：

本轮目标是纯化当前运行边界，而不是提供一轮中间兼容协议。

## 9. 验证策略

### 9.1 后端路由层

需要验证：

1. active routes 仍然可用
2. 退役 routes 返回 `404`

重点验证：

1. `auth/token`
2. `destinations/resolve`
3. `plans/brief`
4. `plans/generate-v2`
5. `plans/validate`
6. `plans/save`
7. `plans/saved`
8. `plans/saved/:id`
9. `plans/saved/:id DELETE`

退役验证目标包括：

1. `community/*`
2. `profile/private-*`
3. `admin/*`
4. `plans/generate`
5. `plans/replan`
6. `plans/revert`
7. `share` 相关路径
8. `events`

### 9.2 iOS 类型与引用层

需要断言：

1. 当前主线文件不再引用：
   - `generate`
   - `replan`
   - `chat/intake`
   - `legacy planner`
2. typecheck 通过

### 9.3 端到端层

只保留 core line smoke：

`auth -> resolve -> brief -> generate-v2 -> validate -> save -> saved-list/detail/delete`

### 9.4 文档与脚本层

以下任一情况都算未完成：

1. README 中仍出现退役路由
2. API 文档中仍出现退役主题
3. 脚本仍出现退役 runtime
4. smoke 仍覆盖退役链路

### 9.5 完成证据

必须同时具备：

1. `git grep` 级别的退役引用检查
2. 后端测试
3. iOS typecheck
4. fresh smoke
5. 干净工作树

不能只依赖手工检查。

## 10. 实施顺序

最终 implementation plan 应按以下顺序展开：

1. 冻结 active boundary，并先写失败检查
2. 后端删除退役公开路由与旧主线 handler
3. 后端删除 store 中的 share / community / profile / personalization 状态与持久化
4. iOS 切断 legacy planner、旧 `generate` / `replan` / `chat` 依赖
5. 更新 README / docs / scripts / smoke
6. 跑 fresh verification，要求工作树干净

## 11. 风险与控制

### 11.1 风险

1. 删除 store 字段后，旧本地数据文件导致启动或读取失败
2. iOS 当前仍有隐蔽的 legacy 引用，导致 typecheck 或运行时断裂
3. README / smoke / service docs 与代码边界再次漂移
4. 一次删除过多 helper，可能误伤仍在 core line 中复用的通用逻辑

### 11.2 控制策略

1. 先写边界检查和 grep 检查，再删实现
2. 路由层、客户端层、store 层分批收口并逐批验证
3. 对保留的 `save/review` 相关 helper 单独回归
4. 明确旧数据不兼容，避免隐式迁移逻辑拖大范围

## 12. 完成标准

只有同时满足以下条件，才算本轮纯化完成：

1. active API 与文档一致
2. iOS 当前主线不再依赖 legacy API
3. store 不再持有退役产品线状态
4. smoke 只覆盖 core line
5. README 与脚本不再提及退役边界

## 13. 后续专题

以下能力在本轮完成后再单独立项：

1. 身份体系
2. 跨设备恢复
3. 新数据库 / 存储升级
4. 编辑 / 优化能力以新的 core API 形式回归
