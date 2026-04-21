# 规划页缺失字段引导补全设计

- 日期：2026-04-22
- 状态：Approved for implementation
- 适用范围：`apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`、`apps/mobile-ios/src/screens/map/PlanEntryView.tsx`、`apps/mobile-ios/package.json`、`apps/mobile-ios/tsconfig.json`、`apps/mobile-ios/tsconfig.test.json`
- 关联文档：
  - `docs/product/trip-core-planning-prd.md`
  - `docs/product/trip-core-planning-architecture.md`
  - `apps/mobile-ios/src/screens/map/MapFlowScreen.tsx`
  - `apps/mobile-ios/src/screens/map/PlanEntryView.tsx`
  - `apps/trip-api-go/internal/app/planner_brief.go`

## 1. 背景

当前 iOS 规划页已经具备完整的主链调用能力：

1. 用户填写目的地、日期、天数和偏好
2. 前端请求 `POST /api/v1/plans/brief`
3. 后端根据 `PlanningBrief` 判断是否已经具备生成条件
4. 满足条件后，前端调用 `POST /api/v1/plans/generate-v2`

但目前“brief 不完整”这一段体验仍偏弱：

1. 前端虽然接收了 `clarification_question`、`suggested_options`、`next_action`
2. `PlanEntryView` 里也能展示状态文案和建议 chip
3. 但用户仍需要自行理解“还缺什么”和“下一步去哪补”

这会造成两个直接问题：

1. 用户第一次点击“发起 AI 行程”后，仍不容易判断卡点是目的地、日期还是天数
2. 建议项更多像静态提示，而不是能真正推动表单往前走的操作

因此这轮需要补的不是新的规划能力，而是：

`把已有 brief 能力转成明确、可操作的表单补全过程`

## 2. 目标

本轮目标是让“brief 不完整”时的规划页更像一个带方向感的助手，而不是只回一段状态文字。

具体目标：

1. 明确告诉用户当前缺失的是哪一类字段
2. 为目的地、日期、天数这三类缺失项提供直接动作
3. 让 `suggested_options` 从提示文字升级成可执行补全动作
4. 保留用户已填写内容，不因补全过程打断输入
5. 为这段引导逻辑建立可跑的轻量测试入口，支持后续继续演进

## 3. 非目标

本轮明确不做：

1. 新增后端接口
2. 改写 `PlanningBrief` 结构
3. 自动生成 itinerary
4. 重做规划页为多步 wizard
5. 结果页可信度展示
6. 双方案生成
7. 保存页搜索筛选

## 4. 方案对比

### 4.1 方案 A：仅增强文案

保留当前页面结构，只优化 `status` 和 `clarification_question` 的文字表现。

优点：

1. 改动最小
2. 风险最低

缺点：

1. 用户仍需自己判断下一步点哪里
2. 建议项仍然不是真动作
3. 不能显著提升首轮生成失败时的可恢复性

### 4.2 方案 B：引导补全型，推荐

保留当前单页表单结构，在顶部增加“还缺什么”引导卡，并让建议项直接驱动对应字段补全或页面跳转。

优点：

1. 最大程度复用当前后端返回和前端状态流
2. 用户感知提升明显
3. 改动范围可控，不会把规划页整个重写

缺点：

1. 需要把引导判断逻辑从组件里抽出来
2. 需要补一个轻量测试入口

### 4.3 方案 C：向导式重构

把规划入口拆成逐步问答流。

优点：

1. 引导最强
2. 交互路径更可控

缺点：

1. 需要重做 `MapFlowScreen` 和 `PlanEntryView` 的状态组织
2. 风险和改动面都明显超出本轮范围
3. 会拖慢后面结果页和双方案功能的推进

### 4.4 结论

采用方案 B：

`引导补全型`

## 5. 交互设计

### 5.1 顶部引导卡

在 `PlanEntryView` 表单顶部新增一张“AI 还需要这些信息”引导卡。

引导卡负责展示：

1. 当前问题：来自 `clarification_question`
2. 当前主动作：来自 `next_action`
3. 建议选项：来自 `suggested_options`
4. 当前缺失字段：来自 `planning_brief.missing_fields`

这张卡不只是状态提示，而是当前 entry 态的主导航。

### 5.2 缺失字段高亮

当 `brief` 不可生成时，页面中对应的输入区块要获得明显高亮。

第一轮只覆盖：

1. 目的地区块
2. 日期 / 天数区块
3. 补充要求区块（仅作为兜底，不作为主缺失项）

高亮方式只需要轻量视觉差异，例如：

1. 边框颜色变化
2. 标题旁风险点或提示标签
3. 区块下方的短说明

本轮不做复杂动画和多级提示。

### 5.3 建议项动作

建议项点击后应优先触发明确动作，而不是只拼接文本。

支持这些动作：

1. `CONFIRM_DAYS`
   - 解析数字
   - 直接更新 `days`
   - 刷新引导状态

2. `CONFIRM_START_DATE`
   - 若建议值是合法日期，直接更新 `startDate`
   - 同时打开日期选择器作为用户确认入口

3. `CONFIRM_DESTINATION`
   - 把建议值写入 `destination`
   - 清空 `selectedDestination`
   - 自动切到目的地搜索页，等待用户选择标准目的地

4. 其他情况
   - 作为补充要求写入 `planningNote`
   - 保持当前 entry 态

### 5.4 手动跳转动作

除了建议项，还应允许用户从引导卡直接执行主动作。

第一轮主动作只有三类：

1. 去确认目的地
2. 去补日期
3. 去补天数

其中：

1. 目的地主动作切到 `DestinationSearchView`
2. 日期和天数主动作打开 `DatePickerSheet`

## 6. 状态与结构设计

### 6.1 `MapFlowScreen`

`MapFlowScreen` 继续作为状态中枢，但不再把所有引导判断硬编码在组件渲染分支里。

本轮应新增一个纯函数层，负责从这些输入推导“引导视图模型”：

1. `planning_brief.missing_fields`
2. `next_action`
3. `clarification_question`
4. `suggested_options`

该视图模型至少包含：

1. 当前是否需要补全
2. 当前主动作类型
3. 当前缺失字段集合
4. 每个建议项对应的动作类型
5. 需要高亮的区块

这样可以避免把业务规则散落在 UI 组件和事件处理里。

### 6.2 `PlanEntryView`

`PlanEntryView` 只负责展示引导，不负责决定规则。

它接收来自 `MapFlowScreen` 的已计算状态，例如：

1. 引导卡标题 / 文案
2. 主动作按钮
3. 建议项按钮
4. 哪些区块高亮

这能让 `PlanEntryView` 继续保持偏展示组件的角色。

### 6.3 `DatePickerSheet`

`DatePickerSheet` 不新增复杂逻辑，只承担：

1. 被外部主动唤起
2. 用户选择日期 / 天数
3. 关闭后回到 entry 态

它本身不判断缺失项，也不直接请求后端。

## 7. 测试设计

### 7.1 为什么要补测试入口

当前 `mobile-ios` 只有 `typecheck`，没有稳定的前端测试入口。

本轮要加的引导逻辑包含：

1. 规则映射
2. 建议项解析
3. 主动作推导

这些逻辑适合做纯函数测试，而且如果继续只放在组件里，就很难可靠回归。

因此本轮应顺手引入一个：

`足够轻量、只服务当前前端纯逻辑测试的最小测试入口`

### 7.2 测试边界

本轮不做完整组件快照或 React Native 渲染测试。

只测试抽出的纯逻辑模块，例如：

1. 缺 `destination` 时主动作应是打开搜索页
2. 缺 `start_date` 时主动作应是打开日期选择器
3. `CONFIRM_DAYS` 建议项能正确解析数字
4. 无法识别的建议项会回退到 `planningNote`
5. 无缺失项时不显示引导卡

### 7.3 入口设计

测试入口只需要满足：

1. 本地可直接运行
2. 不要求引入完整 RN 测试栈
3. 能验证纯 TypeScript 逻辑

允许为此新增最小脚本和最小测试配置，但目标是：

`优先验证规则层，而不是搭一整套重测试框架`

## 8. 错误处理

### 8.1 brief 不可生成

当 `plans/brief` 返回 `ready_to_generate = false` 时：

1. 不进入 `generating`
2. 不清空已填表单
3. 展示引导卡
4. 保留 `assistant_message` 作为状态文案

### 8.2 建议项无法解析

当建议项既不是合法日期，也不能提取天数时：

1. 不抛错
2. 回退为写入 `planningNote`
3. 更新状态提示，说明已记录补充偏好

### 8.3 用户取消补全动作

当用户从目的地搜索或日期选择中返回时：

1. 不清空已有表单
2. 不丢失当前引导状态
3. 仍可继续点击其他建议项

## 9. 成功标准

本轮完成后，应满足：

1. 用户第一次点击“发起 AI 行程”后，能清楚看到缺失项
2. 目的地 / 日期 / 天数三类缺失项都有直接补全动作
3. 建议项点击后会真正推动表单前进，而不是只显示文案
4. `MapFlowScreen` 的引导规则被抽到纯逻辑层
5. 这段纯逻辑拥有可运行的自动化测试
6. 不新增后端 API，不改变生成主链

## 10. 后续衔接

这个子项目完成后，后面的优先级仍按当前顺序继续：

1. 结果页展示可信度 / 降级原因 / 校验结果
2. 双方案生成
3. 保存页搜索筛选

原因是本轮补全的是：

`生成前的可达性`

下一轮再补：

`生成后的可解释性`

这两个方向天然衔接，但应分开实现，以避免一次改动同时触碰 entry 和 result 两端。 
