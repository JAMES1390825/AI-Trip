# Trip Assistant v1.2 前端任务清单（N1-N4）
更新时间：2026-03-21
负责人建议：Web 前端组
关联 PRD：[trip-assistant-prd-v2-p0.md](./trip-assistant-prd-v2-p0.md)
关联 API：[trip-assistant-v1.2-api-delta.md](./trip-assistant-v1.2-api-delta.md)

---

## 1. 范围说明

本清单覆盖 v1.2 P1 前端目标：

- N1 分享页只读地图
- N2 风险提醒增强（动作化）
- N3 清单提醒闭环
- N4 今天模式执行状态

---

## 2. 任务分解（可直接排期）

| ID | 任务 | 主要文件 | 依赖 | 估算 | 完成标准（DoD） |
|---|---|---|---|---|---|
| FE12-01 | `/share` 地图面板（只读） | `src/pages/ShareTripPage.tsx`, `assets/css/main.css` | API12-01 | 2 人日 | 分享页可渲染地图点位与连线，不出现任何可写操作 |
| FE12-02 | 分享页“时间线-地图”联动 + 按天筛选 | `src/pages/ShareTripPage.tsx`, `assets/js/core.ts` | FE12-01 | 1.5 人日 | 点击时间线定位地图点位，支持全部/按天查看 |
| FE12-03 | 风险提醒动作化 UI | `src/pages/TripPage.tsx`, `assets/css/main.css` | API12-02 | 1.5 人日 | 风险项展示动作按钮（替换/加清单/外链）且反馈明确 |
| FE12-04 | 风险动作接入（重排/任务/外链） | `src/pages/TripPage.tsx`, `assets/js/core.ts` | FE12-03 | 2 人日 | 点击风险动作后可完成对应行为并给出结果提示 |
| FE12-05 | 清单提醒配置与筛选视图 | `src/pages/TripPage.tsx`, `src/pages/SettingsPage.tsx`, `assets/css/main.css` | API12-03 | 1.5 人日 | 支持“只看未完成+即将到期”、提醒开关和策略展示 |
| FE12-06 | 浏览器提醒与权限流程 | `assets/js/core.ts`, `src/pages/TripPage.tsx` | FE12-05 | 1.5 人日 | 用户可开启提醒，拒绝权限时有可恢复提示 |
| FE12-07 | 今天模式执行状态 UI | `src/pages/TripPage.tsx`, `assets/css/main.css` | API12-04 | 2 人日 | 时段支持 `done/skipped`，显示今日进度，完成后自动聚焦下一项 |
| FE12-08 | 执行状态 API 联调与回退策略 | `assets/js/core.ts`, `src/pages/TripPage.tsx` | FE12-07 | 1 人日 | `/execution` 可读写；失败时自动回退本地状态并提示 |
| FE12-09 | 埋点补齐与移动端收口 | `assets/js/core.ts`, 全页面 | FE12-01~08 | 1.5 人日 | 事件口径完整，移动端无阻断缺陷 |

---

## 3. Sprint 建议（前端）

### Sprint A（第 1 周）

- FE12-01
- FE12-02
- FE12-09（部分：埋点骨架）

### Sprint B（第 2 周）

- FE12-03
- FE12-04
- FE12-05

### Sprint C（第 3 周）

- FE12-06
- FE12-07
- FE12-08
- FE12-09（收口）

---

## 4. 联调检查点

| 检查点 | 时间 | 验收内容 |
|---|---|---|
| FE12-L1 | W1 周中 | 分享页地图可用，点位与时间线顺序一致 |
| FE12-L2 | W2 周中 | 风险动作链路可执行，异常态可恢复 |
| FE12-L3 | W3 周中 | 今天模式执行状态可持久化，提醒流程可用 |
| FE12-L4 | 发布前 | 埋点字段完整、移动端回归通过 |

---

## 5. 风险与应对

- 风险：分享页地图引入后首屏负载升高。
- 应对：地图懒加载 + 无坐标时降级时间线。

- 风险：浏览器通知权限被拒导致提醒体验割裂。
- 应对：权限拒绝后仍保留应用内提醒条。

- 风险：执行状态与版本回退逻辑冲突。
- 应对：执行状态独立存储，不写入版本链。

---

## 6. 前端验收清单

- 分享页可查看地图且保持只读。
- 风险提醒具备明确动作入口。
- 清单支持提醒视图与权限处理。
- 今天模式支持完成/跳过并自动推进。
- 埋点覆盖 N1-N4 关键行为。
