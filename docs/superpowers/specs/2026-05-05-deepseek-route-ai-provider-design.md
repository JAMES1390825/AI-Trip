# DeepSeek Route AI Provider Design

## Goal

Support DeepSeek as an alternative route-arrangement AI provider for the C-end personal travel planner while preserving the current Amap-first, candidate-only route safety model.

## Context

The current real route pipeline uses Amap for real POI candidates and walking estimates. AI is only allowed to arrange provided candidate IDs and write user-facing explanations. If AI is unavailable or invalid, the system falls back to deterministic Amap rule planning, then to local seed data when Amap cannot provide enough candidates.

DeepSeek should fit this same role: it can help decide route order and explanations, but it must not become a POI source or invent destinations.

Official DeepSeek docs confirm:

- DeepSeek chat creation uses `POST /chat/completions`.
- Current model IDs include `deepseek-v4-flash` and `deepseek-v4-pro`.
- JSON Output uses `response_format: { "type": "json_object" }`.
- The prompt must explicitly ask for JSON, and empty/truncated JSON can happen, so local validation remains mandatory.

References:

- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/guides/json_mode

## Product Behavior

When `AI_PROVIDER=deepseek` and `DEEPSEEK_API_KEY` are configured:

1. The route generator still infers user intent locally.
2. The route generator still asks Amap for real POI candidates.
3. DeepSeek receives only the user request, route blueprint summary, and normalized candidate IDs/names/addresses/tags.
4. DeepSeek returns JSON containing selected candidate IDs, day assignment, stop reasons, overall arrangement reason, skip suggestion, and weather alternative.
5. Existing `validateAiArrangement` accepts only known candidate IDs and rejects duplicates or invalid day assignments.
6. Invalid, empty, or non-JSON DeepSeek output falls back to deterministic Amap rule arrangement.

The user-facing card should keep showing `planningMode: "ai_amap"` when any valid AI provider arranges real Amap candidates. Provider-specific labels can remain out of the card for now; operational docs explain which provider is selected.

## Technical Design

Add a provider-neutral AI route client interface:

```ts
export type RouteAiJsonClient = {
  createJson<T>(systemPrompt: string, userPrompt: string, schema: JsonSchema): Promise<T | null>;
};
```

Create a factory:

```ts
createRouteAiClient(): RouteAiJsonClient | undefined
```

Provider selection:

- `AI_PROVIDER=deepseek`: use DeepSeek only when `DEEPSEEK_API_KEY` is present.
- `AI_PROVIDER=openai` or unset: use OpenAI only when `OPENAI_API_KEY` is present.
- Unsupported provider or missing key: return `undefined`, which preserves rule fallback.

DeepSeek adapter:

- File: `apps/web/src/server/deepseek-route-client.ts`
- Endpoint: `${DEEPSEEK_BASE_URL || "https://api.deepseek.com"}/chat/completions`
- Model default: `DEEPSEEK_MODEL || "deepseek-v4-flash"`
- Body includes `messages`, `response_format: { type: "json_object" }`, and a reasonable `max_tokens`.
- The system prompt must include the word `json` and a compact example structure.
- Parse `choices[0].message.content` as JSON.
- Return `null` on missing key, non-OK response, empty content, or parse failure.

OpenAI adapter:

- Keep the existing Responses API client.
- It already implements `createJson`, so it can satisfy the provider-neutral interface.

## Error Handling

DeepSeek failures must be boring and safe:

- No API key: skip AI, use rule arrangement.
- HTTP error: skip AI, use rule arrangement.
- Empty content: skip AI, use rule arrangement.
- Invalid JSON: skip AI, use rule arrangement.
- Valid JSON with invented candidate IDs: existing validator rejects and falls back.

## Environment Variables

Tracked examples should document:

```bash
AMAP_WEB_SERVICE_KEY=

AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

The implementation must not commit real keys.

## Testing

Add tests for:

- DeepSeek client returns `null` without an API key.
- DeepSeek client posts to `/chat/completions` with `response_format.type=json_object`.
- DeepSeek client parses `choices[0].message.content`.
- DeepSeek client returns `null` for invalid JSON or empty content.
- Provider factory picks DeepSeek when `AI_PROVIDER=deepseek` and a DeepSeek key exists.
- Provider factory keeps OpenAI as the default when OpenAI key exists and provider is unset.
- Real route planner uses the provider-neutral client factory without changing fallback behavior.

## Out Of Scope

- Streaming AI responses.
- DeepSeek tool calling or beta strict function schema.
- Exposing selected AI provider in the public route card UI.
- Multi-provider retry chains in one request.
