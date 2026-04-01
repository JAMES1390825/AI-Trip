# Product Docs Map

更新时间：2026-04-02  
状态：当前产品与系统文档入口

---

## 1. 目录说明

`docs/product` 现在只保留当前主线文档，不再混放旧版 PRD、旧版 API delta、旧版 tasklist 和早期 Web 线框。

当前主线已经收口为：

`Go 后端 + 独立 AI Service + iOS App + Admin Web + 真实地图事实驱动规划`

---

## 2. 当前文档集

- [current-doc-set.md](./current-doc-set.md)
当前保留文档、已删除主题和管理规则的一页说明。

### 2.1 系统总蓝图

- [trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)
回答系统如何分层管理事实、用户反馈、聚合统计与后续社区信号。

### 2.2 个人化与社区化主线

- [trip-personal-and-community-prd-v1.md](./trip-personal-and-community-prd-v1.md)
定义下一阶段产品主线：个人默认私有学习 + 社区公开经验层，以及它们与事实层的边界。

### 2.3 个人私有信号层

- [trip-user-private-signals-prd-v1.md](./trip-user-private-signals-prd-v1.md)
将用户私有行为层收敛为可开发的事件模型、画像 schema、排序接入点与分期交付方案。

- [trip-user-private-signals-tasklist-v1.md](./trip-user-private-signals-tasklist-v1.md)
将个人私有信号层拆为后端、App、验证三类开发任务与阶段交付。

### 2.4 社区能力任务清单

- [trip-community-tasklist-v1.md](./trip-community-tasklist-v1.md)
收口社区发布、投票、反哺规划链路的当前实现状态与后续待办。

### 2.5 社区专题设计

- [trip-community-governance-prd-v1.md](./trip-community-governance-prd-v1.md)
定义社区举报、限流、信号准入与后台治理边界。

### 2.6 真实数据规划架构

- [trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)
回答真实 POI、路线、天气、校验与模型后置介入怎么组合。

### 2.7 API 契约

- [trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md)
冻结移动端真实数据规划链路的接口与数据模型。

### 2.8 页面与状态流

- [trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)
定义移动端主流程、页面结构、结果态与异常态。

### 2.9 开发任务清单

- [trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)
定义客户端、Go 后端、模型协作层与联调检查点。

---

## 3. 推荐阅读路径

### 3.1 新成员上手

1. [../../README.md](../../README.md)
2. [current-doc-set.md](./current-doc-set.md)
3. [trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)
4. [trip-personal-and-community-prd-v1.md](./trip-personal-and-community-prd-v1.md)
5. [trip-user-private-signals-prd-v1.md](./trip-user-private-signals-prd-v1.md)
6. [trip-user-private-signals-tasklist-v1.md](./trip-user-private-signals-tasklist-v1.md)
7. [trip-community-tasklist-v1.md](./trip-community-tasklist-v1.md)
8. [trip-community-governance-prd-v1.md](./trip-community-governance-prd-v1.md)
9. [trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)
10. [trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md)
11. [trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)
12. [trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)

### 3.2 只看规划系统

1. [trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)
2. [trip-personal-and-community-prd-v1.md](./trip-personal-and-community-prd-v1.md)
3. [trip-user-private-signals-prd-v1.md](./trip-user-private-signals-prd-v1.md)
4. [trip-user-private-signals-tasklist-v1.md](./trip-user-private-signals-tasklist-v1.md)
5. [trip-community-tasklist-v1.md](./trip-community-tasklist-v1.md)
6. [trip-community-governance-prd-v1.md](./trip-community-governance-prd-v1.md)
7. [trip-mobile-real-data-architecture-v1.md](./trip-mobile-real-data-architecture-v1.md)
8. [trip-mobile-real-data-api-contract-v1.md](./trip-mobile-real-data-api-contract-v1.md)

### 3.3 只看移动端体验与交付

1. [trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)
2. [trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)

---

## 4. 维护规则

1. 当前主题如果已有主文档，优先更新该文档，不再新增并行版本号文档。
2. 若某份文档不再指导当前开发，应删除而不是继续保留在目录中。
3. 若需要新增文档，先确认它是否真的与现有主文档职责不同。
4. 社区图片当前仅保留本地上传 MVP 说明，不再维护独立图片审核专题文档。
