# AI Trip Core Planning PRD

更新时间：2026-04-20  
状态：Current Mainline PRD

## 产品目标

提供一个由 iOS 客户端发起、由 Go 后端完成规划并支持服务端保存/回看的 AI 行程规划产品。

## 核心用户问题

用户需要用尽可能少的输入，得到一份可解释、可校验、可保存、可回看的行程方案，并在更换设备后仍能恢复已保存内容。

## 当前范围

1. 输入规划需求
2. 生成 itinerary
3. 校验和降级提示
4. 保存 itinerary
5. 回看已保存 itinerary
6. 通过服务端保存/回看实现跨设备恢复

## 核心用户旅程

1. 用户在 iOS App 输入目的地、日期、天数、预算、节奏和补充说明
2. Go 后端整理 brief，并决定是否已经具备生成条件
3. Go 后端生成 itinerary，补充可靠性与降级信息
4. 用户查看结果，并决定是否保存
5. 用户稍后在同设备或新设备上打开已保存 itinerary 继续回看

## 关键产品要求

1. 当前运行边界只保留 Go backend + iOS app
2. AI 能力服务于 brief、chat/intake、explain，不脱离 Go 服务单独运行
3. 保存后的 itinerary 由服务端持久化，作为当前真值
4. 回看接口必须返回可供 iOS 直接展示的完整数据

## 成功标准

1. 用户可以完成一次端到端规划
2. 用户可以保存 itinerary
3. 用户可以重新打开已保存 itinerary
4. 已保存 itinerary 可以作为跨设备恢复入口

## 明确不做

1. 社区分享
2. 社区参考
3. 个人化学习
4. 私有信号排序
5. Web 用户端
6. Python AI service
