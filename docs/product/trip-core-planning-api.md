# AI Trip Core Planning API

更新时间：2026-04-20  
状态：Current Mainline API

## Active endpoints

- `POST /api/v1/auth/token`
- `GET /api/v1/destinations/resolve`
- `POST /api/v1/plans/brief`
- `POST /api/v1/plans/generate-v2`
- `POST /api/v1/plans/validate`
- `POST /api/v1/plans/save`
- `GET /api/v1/plans/saved`
- `GET /api/v1/plans/saved/:id`
- `DELETE /api/v1/plans/saved/:id`

## Contract notes

### `POST /api/v1/auth/token`

建立当前设备或用户的认证上下文。

### `GET /api/v1/destinations/resolve`

把自由输入收口为结构化目的地实体，为规划主链路提供标准化输入。

### `POST /api/v1/plans/brief`

生成可用于后续 itinerary 生成的 planning brief，并返回是否已 ready_to_generate。

### `POST /api/v1/plans/generate-v2`

生成 itinerary，返回结果、可靠性字段和必要的降级信息。

### `POST /api/v1/plans/validate`

独立校验 itinerary，供结果展示与保存前复核使用。

### `POST /api/v1/plans/save`

把当前 itinerary 持久化到服务端，作为后续回看与跨设备恢复入口。

### `GET /api/v1/plans/saved`

返回当前用户或设备名下的已保存 itinerary 列表。

### `GET /api/v1/plans/saved/:id`

返回单个已保存 itinerary 的完整详情，供回看页面直接消费。

### `DELETE /api/v1/plans/saved/:id`

删除指定 saved itinerary；删除成功返回 `204 No Content`。

## Out of scope

- 社区接口
- 个人化或私有信号接口
- Web-only endpoints
- Python AI service bridge endpoints
