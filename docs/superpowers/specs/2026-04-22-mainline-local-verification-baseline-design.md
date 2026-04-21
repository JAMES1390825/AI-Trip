# 主线本地验证基线设计

- 日期：2026-04-22
- 状态：Drafted for review
- 适用范围：`README.md`、`apps/mobile-ios/README.md`、`apps/trip-api-go/README.md`、`scripts/dev.sh`、`scripts/smoke/run-local-e2e.sh`
- 关联文档：
  - `README.md`
  - `docs/README.md`
  - `docs/product/trip-core-planning-prd.md`
  - `docs/product/trip-core-planning-architecture.md`
  - `docs/product/trip-core-planning-tasklist.md`
  - `apps/trip-api-go/README.md`
  - `apps/mobile-ios/README.md`

## 1. 背景

仓库最近已经完成主线收缩，当前唯一有效产品线是：

`Go backend + iOS app + planning + save/review`

代码基线并没有明显失稳：

1. 后端 `go test ./...` 当前可通过
2. iOS `npm run typecheck` 当前可通过
3. 本地 smoke 已覆盖 `resolve -> brief -> generate-v2 -> validate -> save -> saved list/detail -> delete`

但工程入口仍存在明显的不一致：

1. 根 README 只给出较粗的启动方式，没有把“快速验证”和“完整验证”清晰分层
2. `apps/mobile-ios/README.md` 仍引用已退役的独立 `trip-ai-service`、旧 `generate` 接口和旧页面结构
3. `apps/trip-api-go/README.md` 虽然已经接近当前边界，但还没有把推荐验证路径和 smoke 关系讲清楚
4. `scripts/dev.sh` 当前更像启动命令集合，还不是统一的开发/验证入口
5. smoke 脚本虽然主链正确，但失败反馈与日志说明还可以更明确

因此这轮优先级不是扩展业务能力，而是建立一个：

`文档可信、脚本可信、验证可信`

的本地开发基线。

## 2. 目标

本轮目标是让团队对“当前主线怎么跑、怎么验、失败时怎么看”形成单一答案。

具体目标：

1. 建立单一、可信的本地验证路径
2. 明确区分快速验证与完整 smoke 验证
3. 统一根 README、后端 README、iOS README 的当前主线描述
4. 让 `scripts/dev.sh` 成为日常开发最先想到的入口
5. 让 smoke 失败时能快速定位到环境、启动、请求或返回结构问题

## 3. 非目标

本轮明确不做：

1. 修改规划、校验、保存、回看的业务逻辑
2. 扩展新的产品能力或新 API
3. 引入 CI 平台、远程流水线或部署系统
4. 改写 iOS 页面结构或后端模块边界
5. 把所有验证都强制收敛到一次昂贵的全量执行

## 4. 方案对比

### 4.1 方案 A：文档先行

只修改 README，不调整脚本和验证入口。

优点：

1. 改动最小
2. 风险最低

缺点：

1. 无法证明文档与真实运行方式一致
2. 开发者仍需要记忆多个分散命令
3. 失败定位体验不会改善

### 4.2 方案 B：单入口验证基线

在保持现有业务逻辑不变的前提下，同时收口文档、统一 `scripts/dev.sh`、增强 smoke 反馈。

优点：

1. 能把“说明”和“执行”绑到同一条主线
2. 风险可控，且收益直接作用于后续开发
3. 最适合为下一轮规划主链路改动建立回归面

缺点：

1. 需要同时改 README 和脚本
2. 需要对验证分层做明确约束，避免命名混乱

### 4.3 方案 C：CI/自动化优先

先围绕测试和 smoke 设计更完整的自动化入口，再慢慢补文档。

优点：

1. 长期收益高
2. 适合后续规模扩展

缺点：

1. 不能直接解决当前本地入口不一致的问题
2. 会把“怎么在本地跑起来”这个最现实的问题继续往后拖

### 4.4 结论

采用方案 B：

`单入口验证基线`

## 5. 目标体验

### 5.1 日常开发体验

开发者应能通过一个入口理解当前常见动作：

1. 查看启动方法
2. 启动后端
3. 启动 iOS
4. 跑后端测试
5. 跑 iOS typecheck
6. 跑快速验证
7. 跑完整 smoke
8. 跑总验证

换句话说，团队应逐步默认：

`优先使用 scripts/dev.sh，而不是各自记忆零散命令`

### 5.2 验证分层

验证必须分成两层，而不是混成一个模糊动作。

#### 快速验证

快速验证面向日常改动后的低成本回归，至少包含：

1. 后端 `go test ./...`
2. iOS `npm run typecheck`

快速验证不默认启动服务，不写本地 store，不触发完整 API 流程。

#### 完整验证

完整验证面向主链路交付前检查，使用 smoke 覆盖：

1. token 获取
2. destination resolve
3. planning brief
4. `generate-v2`
5. validate
6. save
7. saved list/detail
8. delete

完整验证允许启动本地后端、写开发态数据文件，并输出结构化结果摘要。

### 5.3 推荐命令模型

本轮建议 `scripts/dev.sh` 至少支持以下任务：

1. `help`
2. `up-local`
3. `backend-dev`
4. `app-dev`
5. `backend-test`
6. `ios-typecheck`
7. `verify-fast`
8. `smoke`
9. `verify`

其中：

1. `verify-fast` 负责轻量验证
2. `smoke` 负责完整主链路验证
3. `verify` 负责串联 `verify-fast` 和 `smoke`

命名目标是让动作语义直观，而不是让开发者猜“某个脚本大概做什么”。

## 6. 文档设计

### 6.1 根 README

根 README 继续承担仓库入口角色，但需要更明确地强调：

1. 当前仓库主线只有 `apps/trip-api-go` 和 `apps/mobile-ios`
2. 推荐先看 `scripts/dev.sh` 提供的任务
3. 推荐验证顺序是：
   - 轻量验证：`verify-fast`
   - 完整主链：`smoke`
   - 全量本地验证：`verify`

README 不需要展开过多实现细节，但要确保新同学看完就能走通第一步。

### 6.2 iOS README

`apps/mobile-ios/README.md` 需要纠正为当前真实状态：

1. 删除独立 `trip-ai-service` 的启动说明
2. 删除旧 `POST /api/v1/plans/generate` 的描述
3. 删除已经不存在或不再是主线的页面说明
4. 改为依赖 Go backend 的当前运行说明
5. 补充当前运行参数和 typecheck 方式

目标是让 iOS README 只描述：

`当前还活着的依赖、接口和开发动作`

### 6.3 后端 README

`apps/trip-api-go/README.md` 作为后端真值文档，需要明确：

1. 当前有效 API 面
2. 环境变量优先级与最小本地启动要求
3. 本地 store 文件位置与开发态清理方式
4. 与 smoke 的关系
5. 推荐先跑的测试或验证命令

后端 README 不需要复述根 README 的所有内容，但要足够独立，便于单独进入后端目录的开发者使用。

## 7. 脚本设计

### 7.1 `scripts/dev.sh`

`scripts/dev.sh` 的角色从“打印几个命令”升级为：

`统一的本地开发与验证入口`

设计要求：

1. 每个任务名对应单一职责
2. 输出应显示当前在执行什么
3. 缺少依赖时给出明确安装提示
4. 组合任务应复用已有单项任务，而不是复制逻辑
5. 成功和失败都要让人能看出停在了哪一步

建议结构：

1. 单项任务：
   - `backend-test`
   - `ios-typecheck`
   - `smoke`
2. 组合任务：
   - `verify-fast`
   - `verify`

### 7.2 `scripts/smoke/run-local-e2e.sh`

smoke 脚本继续保留为完整主链路校验器，不改它的核心职责。

本轮只增强可用性和可诊断性：

1. 启动前校验 `go`、`curl`、`node`
2. 明确说明默认 `env` 文件来源
3. 在后端启动失败或健康检查超时时，提示查看日志路径
4. API 失败时输出请求阶段和响应内容
5. 成功时继续输出结构化摘要，便于人工或脚本读取
6. 保持删除保存计划后的回查断言，确保主链收尾完整

本轮不把 smoke 改造成通用测试框架，也不引入额外依赖。

## 8. 错误处理策略

### 8.1 文档层

如果某项说明已经不再真实存在，就直接删除，而不是保留“兼容说明”。

原则：

1. 当前文档只服务当前主线
2. 不为已退役运行方式保留教程

### 8.2 `dev.sh` 层

`dev.sh` 的失败反馈应优先回答三个问题：

1. 当前执行的是哪一步
2. 失败发生在依赖检查、命令执行还是下游脚本
3. 接下来应该看哪里

例如：

1. 缺命令时给出安装提示
2. smoke 失败时指出去看具体日志文件
3. 参数错误时打印合法任务列表

### 8.3 smoke 层

smoke 脚本的错误应按阶段暴露：

1. 服务未启动
2. token 获取失败
3. destination resolve 失败
4. brief 不可生成
5. `generate-v2` 返回结构异常
6. save / list / detail / delete 任一步失败

阶段化错误的目标不是“优雅”，而是：

`让开发者一眼知道主链断在哪`

## 9. 测试与验收

### 9.1 实施后必须验证

1. `bash scripts/dev.sh backend-test`
2. `bash scripts/dev.sh ios-typecheck`
3. `bash scripts/dev.sh verify-fast`
4. `bash scripts/dev.sh smoke`

若实现了 `verify`，还需要验证：

5. `bash scripts/dev.sh verify`

### 9.2 验收标准

本轮完成后，应满足：

1. 根 README、iOS README、后端 README 不再引用已退役的独立 AI service 或旧主线接口
2. `scripts/dev.sh` 能覆盖常见启动和验证动作
3. 快速验证与完整验证的边界清晰
4. smoke 仍覆盖当前保存/回看主链
5. 失败信息足够明确，开发者不需要翻代码猜测下一步

## 10. 风险与边界

### 10.1 风险

主要风险不是业务回归，而是：

1. 命令命名调整后，团队短期内仍习惯旧入口
2. README 与脚本若只改一边，会再次产生漂移
3. smoke 若增强过度，可能让轻量验证成本变高

### 10.2 控制策略

对应控制策略：

1. 让 README 明确把 `scripts/dev.sh` 作为首推入口
2. 把文档修改和脚本修改放在同一轮提交里
3. 保持 `verify-fast` 与 `smoke` 分层，不把所有动作压成一次重运行

## 11. 后续衔接

本轮完成后，仓库会得到一个更可信的本地回归基线。

下一轮再进入：

`规划主链路完善`

时，可以直接复用：

1. `verify-fast` 作为日常回归
2. `smoke` 作为主链集成回归
3. README 作为统一开发入口

这也是本轮的核心价值：

`先把底座校平，再继续改主链功能。`
