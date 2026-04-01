# AI Trip 当前文档集说明

更新时间：2026-04-02  
状态：Current Canonical Set

---

## 1. 这份文档的目的

这份文件只回答一件事：

当前仓库里哪些文档还在指导开发，哪些主题已经被删除或合并。

---

## 2. 当前保留的主线文档

1. 系统蓝图：
   - `trip-system-signals-and-learning-architecture-v1.md`
2. 产品主 PRD：
   - `trip-personal-and-community-prd-v1.md`
3. 个人私有信号：
   - `trip-user-private-signals-prd-v1.md`
   - `trip-user-private-signals-tasklist-v1.md`
4. 社区：
   - `trip-community-tasklist-v1.md`
   - `trip-community-governance-prd-v1.md`
5. 真实数据规划：
   - `trip-mobile-real-data-architecture-v1.md`
   - `trip-mobile-real-data-api-contract-v1.md`
   - `trip-mobile-wireframes-v2.md`
   - `trip-mobile-v2-tasklist.md`

---

## 3. 已删除或不再单独维护的主题

1. 独立“社区图片审核 PRD”已删除。
2. 图片能力当前只保留“本地上传 MVP”说明，分散记录在：
   - 仓库 `README.md`
   - `apps/trip-api-go/README.md`
   - `trip-community-tasklist-v1.md`
3. 若未来真的需要对象存储、缩略图、异步媒体处理，再单独补一份新的工程方案文档，不复活旧稿。

---

## 4. 管理规则

1. 同一主题尽量只保留一份主文档。
2. 已经失效的专题文档直接删除，不保留“也许以后有用”的旧稿。
3. 新增文档前先判断能否直接并入现有主文档。
