# AI Trip 文档总览

更新时间：2026-04-02  
状态：当前有效文档导航

---

## 1. 文档整理原则

本目录已经按“只保留当前主线文档”重新收口：

1. `docs/product` 仅保留当前仍指导开发、联调和产品决策的文档。
2. 已被当前移动端真实数据主线覆盖的旧 PRD、旧 API delta、旧 tasklist、旧 Web 线框已删除。
3. 以后若某份文档失效，优先更新现有主文档；不再默认保留一份“历史版本”继续并存。

---

## 2. 建议阅读顺序

如果要快速理解当前仓库主线，按下面顺序阅读即可：

1. [../README.md](../README.md)
启动方式、环境变量、仓库组件边界。

2. [adr/ADR-001-tech-stack-and-boundaries.md](./adr/ADR-001-tech-stack-and-boundaries.md)
当前技术栈与服务边界。

3. [product/README.md](./product/README.md)
当前产品与系统文档入口。

4. [product/current-doc-set.md](./product/current-doc-set.md)
当前保留文档和已删除主题的一页说明。

5. [product/trip-system-signals-and-learning-architecture-v1.md](./product/trip-system-signals-and-learning-architecture-v1.md)
系统总蓝图，覆盖事实层、反馈层、聚合层与社区层边界。

6. [product/trip-personal-and-community-prd-v1.md](./product/trip-personal-and-community-prd-v1.md)
定义下一阶段产品主线：个人化持续学习 + 社区化公开经验。

7. [product/trip-user-private-signals-prd-v1.md](./product/trip-user-private-signals-prd-v1.md)
个人私有信号层的事件模型、画像 schema、排序接入点与交付分期。

8. [product/trip-user-private-signals-tasklist-v1.md](./product/trip-user-private-signals-tasklist-v1.md)
个人私有信号层的后端、App、验证任务拆分与当前启动项。

9. [product/trip-community-tasklist-v1.md](./product/trip-community-tasklist-v1.md)
社区发布、投票、反哺规划链路的当前实现与下一阶段待办。

10. [product/trip-community-governance-prd-v1.md](./product/trip-community-governance-prd-v1.md)
社区举报、限流、AI 信号准入与后台治理边界。

11. [product/trip-mobile-real-data-architecture-v1.md](./product/trip-mobile-real-data-architecture-v1.md)
真实 POI、路线、天气驱动的规划架构。

12. [product/trip-mobile-real-data-api-contract-v1.md](./product/trip-mobile-real-data-api-contract-v1.md)
移动端真实数据主链路 API 契约。

13. [product/trip-mobile-wireframes-v2.md](./product/trip-mobile-wireframes-v2.md)
移动端主流程、页面结构与状态流。

14. [product/trip-mobile-v2-tasklist.md](./product/trip-mobile-v2-tasklist.md)
当前主线开发任务拆分与联调检查点。

---

## 3. 按目录查找

### 3.1 架构与决策

- [adr/ADR-001-tech-stack-and-boundaries.md](./adr/ADR-001-tech-stack-and-boundaries.md)

### 3.2 产品与系统主线

- [product/README.md](./product/README.md)
- [product/current-doc-set.md](./product/current-doc-set.md)
- [product/trip-system-signals-and-learning-architecture-v1.md](./product/trip-system-signals-and-learning-architecture-v1.md)
- [product/trip-personal-and-community-prd-v1.md](./product/trip-personal-and-community-prd-v1.md)
- [product/trip-user-private-signals-prd-v1.md](./product/trip-user-private-signals-prd-v1.md)
- [product/trip-user-private-signals-tasklist-v1.md](./product/trip-user-private-signals-tasklist-v1.md)
- [product/trip-community-tasklist-v1.md](./product/trip-community-tasklist-v1.md)
- [product/trip-community-governance-prd-v1.md](./product/trip-community-governance-prd-v1.md)
- [product/trip-mobile-real-data-architecture-v1.md](./product/trip-mobile-real-data-architecture-v1.md)
- [product/trip-mobile-real-data-api-contract-v1.md](./product/trip-mobile-real-data-api-contract-v1.md)
- [product/trip-mobile-wireframes-v2.md](./product/trip-mobile-wireframes-v2.md)
- [product/trip-mobile-v2-tasklist.md](./product/trip-mobile-v2-tasklist.md)

### 3.3 指标与运维

- [metrics/v1-kpi-definition.md](./metrics/v1-kpi-definition.md)
- [metrics/alert-runbook.md](./metrics/alert-runbook.md)

---

## 4. 维护规则

1. 新增当前主线文档时，先更新本文件与 `docs/product/README.md`。
2. 当前文档必须写清楚：
- 更新时间
- 状态
- 适用范围
- 关联文档
3. 不再默认保留同主题的 `v1 / v1.1 / v1.2` 并行草稿；若旧文档已失效，应直接删除或合并进当前文档。
4. 若需要保留历史背景，优先写进当前文档的“背景 / 演进”章节，而不是新增一份并行旧文档。
5. 社区图片当前只保留本地上传 MVP 说明，不再维护单独的“图片审核 PRD”。
