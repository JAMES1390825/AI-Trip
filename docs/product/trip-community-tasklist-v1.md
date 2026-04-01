# AI Trip 社区能力开发清单（v1）

更新时间：2026-04-02  
状态：In Progress  
适用范围：`apps/mobile-ios` + `apps/trip-api-go`

关联文档：
- [trip-personal-and-community-prd-v1.md](./trip-personal-and-community-prd-v1.md)
- [trip-system-signals-and-learning-architecture-v1.md](./trip-system-signals-and-learning-architecture-v1.md)
- [trip-community-governance-prd-v1.md](./trip-community-governance-prd-v1.md)
- [trip-mobile-wireframes-v2.md](./trip-mobile-wireframes-v2.md)
- [trip-mobile-v2-tasklist.md](./trip-mobile-v2-tasklist.md)

---

## 1. 目标

把“社区分享 -> 结构化处理 -> 反哺 AI 规划”做成一条真实可运行的闭环，而不是停留在 PRD 概念层。

当前默认规则：

1. 用户发布的分享先做结构化处理。
2. 只有 `published` 的帖子会进入公共社区与规划信号层。
3. 社区信号只能影响候选排序与解释，不覆盖 POI / 路线 / 天气真值。

---

## 2. 本轮已完成

### 2.1 后端社区 MVP

- 已新增社区帖子模型、投票模型、投票汇总与存储持久化。
- 已新增接口：
  - `POST /api/v1/community/posts`
  - `GET /api/v1/community/posts`
  - `GET /api/v1/community/posts/{id}`
  - `POST /api/v1/community/posts/{id}/vote`
- 已实现默认处理规则：
  - 标题 / 正文 / 标签规范化
  - 餐厅 / 景点 / 提及地点提取
  - `draft / published / limited` 状态判定
  - `quality_score` 计算

### 2.2 社区反哺 AI 规划

- `generate-v2` 已支持 `options.community_post_ids`。
- 规划系统会自动弱参考同城公开帖子。
- 若用户显式勾选社区帖子，会对对应地点和标签施加更强权重。
- 行程结果会附带：
  - `community_reference_summary`
  - `community_signal_mode`
  - block 级 `community_basis`

### 2.3 移动端入口

- `行程` Tab 已接入：
  - 发布社区分享
  - 浏览社区精选
  - 对帖子投票“有帮助”
  - 对帖子投票“想去”
- `AI规划` Tab 已接入：
  - 目的地社区灵感列表
  - 勾选帖子作为规划参考

### 2.7 社区详情与创作者公开资料

- 已新增接口：
  - `GET /api/v1/community/posts/{id}/detail`
  - `GET /api/v1/community/authors/{user_id}`
- 社区帖子详情已返回：
  - 作者公开资料
  - 相关推荐
  - `reference_count / referenced_save_count`
- `行程` Tab 已接入：
  - 社区帖子详情弹层
  - 创作者公开资料弹层
  - “带去 AI 规划”快捷入口
  - “我的公开分享”列表

### 2.4 社区治理闭环

- 已新增用户举报接口：
  - `POST /api/v1/community/posts/{id}/report`
- 已新增管理员治理接口：
  - `GET /api/v1/admin/community/posts`
  - `GET /api/v1/admin/community/reports`
  - `POST /api/v1/admin/community/posts/{id}/moderate`
- 已实现默认治理规则：
  - 同一用户重复举报会合并更新
  - 不同用户举报数达到 2 条时，帖子自动进入 `reported`
  - `reported / limited / removed` 帖子不会进入 AI 规划信号层
  - 管理员可执行 `approve / limit / remove / restore`
- `行程` Tab 已新增社区卡片举报入口

### 2.5 从已保存行程生成社区草稿

- 已新增接口：
  - `GET /api/v1/plans/saved/{id}/community-draft`
- 已实现默认草稿规则：
  - 从已保存行程提取目的地、天数、主要 POI、推荐餐厅与景点
  - 自动生成可编辑标题、正文与初始标签
  - 不直接发帖，仍由用户在 App 内确认后发布
- `行程` Tab 的已保存行程卡片已新增“转成帖子草稿”入口

### 2.6 社区图片上传 MVP

- 已新增接口：
  - `POST /api/v1/community/media`
  - `GET /api/v1/community/media/{filename}`
- 已接入 App 端本地相册选择：
  - 使用 `expo-image-picker`
  - 上传成功后自动把 `public_url` 回填到帖子表单
- 已实现当前最小可用链路：
  - App `multipart/form-data` 上传图片到 Go 后端
  - Go 后端把图片保存到 `COMMUNITY_MEDIA_DIR`
  - 公开图片通过后端静态托管访问
- 当前限制：
  - 单张图片最大 8MB
  - 支持 `jpg/png/gif/webp/heic/heif`
  - 默认仍是本地开发存储，不是对象存储正式方案

---

## 3. 本轮未完成但已明确的后续项

| 编号 | 优先级 | 任务 | 当前说明 |
| --- | --- | --- | --- |
| COM-01 | P1 | 社区图片上传工程化 | 本地相册选择 + 本地磁盘上传已完成，下一步是 OSS / S3、上传会话、删除与回收策略 |
| COM-05 | P2 | 社区信号实验平台 | 当前是固定规则加权，后续需要 A/B 与参数调优 |

---

## 4. 建议下一阶段顺序

### Phase A

1. 接真实图片选择与上传。
2. 补社区帖子详情页与引用来源回看。

对应专题文档：

1. [trip-community-governance-prd-v1.md](./trip-community-governance-prd-v1.md)

### Phase B

1. 做帖子详情页与更多互动。
2. 加社区来源解释卡。
3. 让用户能在结果页回看“本次用了哪些社区参考”。

### Phase C

1. 做社区质量评分实验。
2. 做目的地公共热门路线榜。
3. 再评估是否需要第三个独立社区 Tab。

---

## 5. 验收口径

当前版本可认为达到 v1 验收的条件：

1. 用户能在 App 中发布一条社区分享。
2. 已发布帖子能被其他用户看到并投票。
3. 规划页能看到目的地相关帖子并勾选引用。
4. 勾选后的社区帖子能影响候选池排序。
5. 社区内容不会覆盖真实地图事实层。
6. 用户能从 iOS 相册选择图片并完成本地上传，帖子卡片能展示上传后的图片。
