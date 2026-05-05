# Bailian Route AI Provider Design

## Goal

Support Alibaba Cloud Bailian Model Studio as a third AI provider for route arrangement while preserving the current Amap-first, candidate-only safety model.

## Context

The route planner already supports:

- Amap as the source of real POI facts and walking estimates.
- OpenAI Responses API for structured candidate arrangement.
- DeepSeek Chat Completions JSON Output for candidate arrangement.
- Deterministic rule fallback when AI is missing, invalid, or unavailable.

Bailian should be another provider behind the same `RouteAiJsonClient` interface. It must only arrange Amap candidates and write explanations; it must not invent POIs or replace Amap as the fact source.

Official Alibaba Cloud Model Studio docs document the OpenAI-compatible endpoint:

- `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- JSON mode via `response_format: { "type": "json_object" }`
- The prompt must explicitly request JSON.

References:

- https://www.alibabacloud.com/help/en/model-studio/use-qwen-by-calling-api
- https://www.alibabacloud.com/help/zh/model-studio/json-mode

## Product Behavior

When `AI_PROVIDER=bailian` and `BAILIAN_API_KEY` are configured:

1. The route generator infers user intent locally.
2. Amap resolves real POI candidates and walking estimates.
3. Bailian receives only request context, route blueprint summary, and normalized Amap candidate IDs/names/addresses/tags.
4. Bailian returns JSON with selected candidate IDs, day assignments, stop reasons, arrangement reason, skip suggestion, and weather alternative.
5. Existing `validateAiArrangement` accepts only known Amap candidate IDs and rejects duplicates or invalid day values.
6. Invalid or unavailable Bailian responses fall back to deterministic Amap rule arrangement.

The public card continues to use `planningMode: "ai_amap"` for valid AI arrangements regardless of provider.

## Technical Design

Add `apps/web/src/server/bailian-route-client.ts`.

Default configuration:

```bash
AI_PROVIDER=bailian
BAILIAN_API_KEY=
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
BAILIAN_MODEL=qwen-plus
```

Client behavior:

- Endpoint: `${BAILIAN_BASE_URL}/chat/completions`
- Auth: `Authorization: Bearer ${BAILIAN_API_KEY}`
- Body:

```json
{
  "model": "qwen-plus",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "response_format": { "type": "json_object" }
}
```

- Parse `choices[0].message.content` as JSON.
- Return `null` for missing API key, non-OK response, empty content, invalid JSON, or unexpected response shape.

Provider factory updates:

- Add `AiProvider = "openai" | "deepseek" | "bailian"`.
- `AI_PROVIDER=bailian` uses `BailianRouteClient` only when `BAILIAN_API_KEY` exists.
- Missing or unsupported provider still returns `undefined` and triggers rule fallback.

## Error Handling

Bailian failures should be invisible to the user except for route quality falling back to rules:

- Missing key: use `rule_amap`.
- HTTP error: use `rule_amap`.
- Invalid JSON: use `rule_amap`.
- Valid JSON with invented IDs: validator rejects and uses `rule_amap`.

## Testing

Add tests for:

- Bailian parser accepts `choices[0].message.content`.
- Bailian parser returns `null` for invalid or empty content.
- Bailian client returns `null` without API key.
- Bailian client posts to `/chat/completions` with JSON mode and model.
- Bailian client returns `null` for non-OK response.
- Provider factory picks Bailian when configured.
- Real route planner produces `ai_amap` when `AI_PROVIDER=bailian` returns a valid arrangement through mocked fetch.

## Out Of Scope

- DashScope native SDK/protocol.
- Streaming.
- Provider retry chains.
- Displaying the selected AI provider in the public UI.
