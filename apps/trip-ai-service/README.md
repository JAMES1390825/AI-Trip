# trip-ai-service

独立 AI 服务层，负责：

- `planning brief` 的自然语言增强与澄清提示
- `chat intake` 的对话润色
- itinerary explain 文案生成

这层只做模型后置能力，不负责正式 POI、路线事实和业务存储。Go 后端仍然负责：

- 目的地标准化
- 行程生成与校验
- 保存、分享、执行态

## 运行方式

```bash
cd apps/trip-ai-service
python3 main.py
```

默认监听：`http://127.0.0.1:8091`

服务会自动尝试加载这些配置文件：

- 当前目录下的 `.env` / `.env.local`
- 上一级目录下的 `.env` / `.env.local`
- 仓库根目录下的 `.env` / `.env.local`

已经在 shell 里显式导出的环境变量优先级更高，不会被 `.env` 覆盖。

## 阿里百炼环境变量

最少需要：

```bash
export BAILIAN_API_KEY=你的百炼Key
```

可选：

```bash
export BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export BAILIAN_MODEL=qwen-plus
export BAILIAN_BRIEF_MODEL=qwen-plus
export BAILIAN_CHAT_MODEL=qwen-plus
export BAILIAN_EXPLAIN_MODEL=qwen-plus
export AI_SERVICE_API_KEY=本地Go后端调用这个服务时使用的共享密钥
export AI_SERVICE_PORT=8091
```

如果没有配置 `BAILIAN_API_KEY`，服务仍然可以启动，但会自动回退到本地规则文案，不会真正调用 LLM。

## Go 后端接入

启动 `trip-api-go` 前加上：

```bash
export AI_SERVICE_BASE_URL=http://127.0.0.1:8091
export AI_SERVICE_API_KEY=本地Go后端调用这个服务时使用的共享密钥
```

这样后端会把以下能力转发到 Python AI 服务：

- `/api/v1/chat/intake/next`
- `/api/v1/plans/brief`
- `/api/v1/plans/generate-v2` 的 explain 增强
