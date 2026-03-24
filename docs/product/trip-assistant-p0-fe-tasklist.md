# Trip Assistant P0 前端任务清单
更新时间：2026-03-21
负责人建议：Web 前端组
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)

---

## 1. 范围说明

本清单覆盖 P0 前端全部交付，目标是保证以下 7 个模块在 Web 端可用：

- 多方案对比
- 出发前清单
- 今天模式
- 动态重排统一交互
- 版本差异可视化
- 只读分享
- 地图与风险诊断

---

## 2. 任务分解（可直接排期）

| ID | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|
| FE-01 | `/plan` 多方案对比面板 | `src/pages/PlanPage.tsx`, `assets/js/core.ts`, `assets/css/main.css` | API-01 | 2 人日 | 生成后可展示 2 套方案（平衡/体验），支持一键设为当前方案并进入 `/trip` |
| FE-02 | `/trip` 增加 `全部/今天` 执行模式 | `src/pages/TripPage.tsx`, `assets/css/main.css` | 无 | 1.5 人日 | 今天模式下仅显示当天时间线与地图，自动高亮当前/下一时段 |
| FE-03 | 出发前清单 UI（最小可用） | `src/pages/TripPage.tsx`, `assets/js/core.ts`, `assets/css/main.css` | API-02 | 2 人日 | 清单可查看与状态切换，状态可持久化，且不影响版本号 |
| FE-04 | 动态重排统一入口与影响范围说明 | `src/pages/TripPage.tsx`, `assets/css/main.css` | 无 | 1 人日 | 窗口重排与快捷优化入口统一，提交前可见影响范围摘要 |
| FE-05 | 版本差异弹层（当前版 vs 目标版） | `src/pages/TripPage.tsx`, `assets/js/core.ts`, `assets/css/main.css` | API-03 | 2 人日 | 版本列表可查看差异并按天过滤，回退前弹层确认 |
| FE-06 | 分享管理（生成/关闭）+ 只读页路由 | `src/pages/TripsPage.tsx`, `src/pages/ShareTripPage.tsx(新增)`, `src/App.tsx`, `assets/js/core.ts` | API-04 | 2.5 人日 | 可生成只读链接并关闭；访客可访问 `/share/:token` 查看行程 |
| FE-07 | 地图诊断卡与风险诊断卡 | `src/pages/TripPage.tsx`, `assets/js/core.ts`, `assets/css/main.css` | API-05 | 1.5 人日 | 地图失败时展示可恢复动作（去设置/重试/纯时间线），风险卡可展示一致性问题 |
| FE-08 | 埋点接入与口径补齐 | `assets/js/core.ts`, 各页面 | API-06 | 1 人日 | P0 事件埋点齐全并带 `session_id/plan_id` 等关键字段 |
| FE-09 | 移动端与无障碍收口 | `assets/css/main.css` | FE-01~FE-07 | 1 人日 | 关键页面移动端无阻断，交互控件可聚焦可点击 |

---

## 3. Sprint 建议（前端）

### Sprint 1（第 1 周）

- FE-01 多方案对比
- FE-02 今天模式
- FE-04 重排统一入口

### Sprint 2（第 2 周）

- FE-03 出发前清单
- FE-05 版本差异可视化

### Sprint 3（第 3 周）

- FE-06 只读分享
- FE-07 诊断卡
- FE-08 埋点补齐
- FE-09 移动端收口

---

## 4. 联调检查点

| 检查点 | 时间 | 验收内容 |
|---|---|---|
| FE-L1 | 周末（W1） | `/plan` 多方案可切换并进入 `/trip` |
| FE-L2 | 周中（W2） | 版本差异、回退确认、清单状态流转完整 |
| FE-L3 | 周中（W3） | 分享页可读、诊断动作可用、埋点入库 |
| FE-L4 | 发布前 | 移动端回归通过，无阻断缺陷 |

---

## 5. 风险与应对

- 风险：`TripPage.tsx` 体积持续膨胀，维护成本上升。
- 应对：按功能拆分组件（MapPanel、TimelinePanel、VersionPanel、DiagnosticsPanel）。

- 风险：方案对比与版本差异交互过多导致信息噪音。
- 应对：默认展示核心指标，其他信息放在“展开更多”。

- 风险：分享只读页被误认为可编辑页。
- 应对：显著显示“只读模式”横幅并隐藏所有写操作按钮。

---

## 6. 前端验收清单

- `/plan` 支持方案对比选择。
- `/trip` 支持全部/今天切换。
- 出发前清单可读可改可持久化。
- 动态重排入口统一，影响范围可见。
- 版本差异可查看，回退前可确认。
- 分享链接可生成、可关闭，访客只读可访问。
- 地图与风险诊断在异常场景有可执行恢复动作。
- 事件埋点字段完整。

