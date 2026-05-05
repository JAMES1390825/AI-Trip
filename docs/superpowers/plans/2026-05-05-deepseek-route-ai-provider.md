# DeepSeek Route AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DeepSeek as a selectable AI provider for real Amap route arrangement.

**Architecture:** Introduce a provider-neutral route AI client interface and factory. Keep OpenAI Responses support intact, add a DeepSeek Chat Completions adapter, and let the real route planner depend on the neutral interface.

**Tech Stack:** Next.js, TypeScript, Node test runner, Fetch API, Amap, OpenAI Responses API, DeepSeek Chat Completions API.

---

## File Structure

- Create `apps/web/src/server/route-ai-client.ts`: shared `JsonSchema`, `RouteAiJsonClient`, `AiProvider`, and `createRouteAiClient`.
- Create `apps/web/src/server/route-ai-client.test.ts`: provider selection tests.
- Create `apps/web/src/server/deepseek-route-client.ts`: DeepSeek JSON chat adapter.
- Create `apps/web/src/server/deepseek-route-client.test.ts`: DeepSeek adapter behavior tests.
- Modify `apps/web/src/server/openai-route-client.ts`: import shared `JsonSchema`.
- Modify `apps/web/src/domain/real-route-planner.ts`: depend on `RouteAiJsonClient` and factory instead of directly constructing OpenAI.
- Modify `.env.example`: document current Amap/OpenAI/DeepSeek env variables.
- Modify `docs/product/citywalk-route-cards-api.md`: document AI provider modes.
- Modify `docs/product/citywalk-route-cards-architecture.md`: document provider-neutral AI arrangement.

## Task 1: DeepSeek Client Tests

- [ ] **Step 1: Write failing tests in `apps/web/src/server/deepseek-route-client.test.ts`**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekRouteClient, parseDeepSeekMessageContent } from "./deepseek-route-client";

test("parseDeepSeekMessageContent parses chat completion message content", () => {
  const payload = { choices: [{ message: { content: "{\"ok\":true}" } }] };
  assert.deepEqual(parseDeepSeekMessageContent<{ ok: boolean }>(payload), { ok: true });
});

test("DeepSeekRouteClient returns null without API key", async () => {
  const client = new DeepSeekRouteClient({ apiKey: "", fetcher: async () => Response.json({}) });
  const result = await client.createJson("system", "user", { type: "object", additionalProperties: true });
  assert.equal(result, null);
});

test("DeepSeekRouteClient posts JSON chat completion request", async () => {
  let requestUrl = "";
  let requestBody = "";
  const client = new DeepSeekRouteClient({
    apiKey: "test-key",
    model: "deepseek-test",
    baseUrl: "https://deepseek.example",
    fetcher: async (url, init) => {
      requestUrl = String(url);
      requestBody = String(init?.body || "");
      return Response.json({ choices: [{ message: { content: "{\"ok\":true}" } }] });
    }
  });

  const result = await client.createJson<{ ok: boolean }>("system", "user", {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(requestUrl, "https://deepseek.example/chat/completions");
  assert.match(requestBody, /deepseek-test/);
  assert.match(requestBody, /json_object/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd apps/web && npm test -- src/server/deepseek-route-client.test.ts`

Expected: FAIL because `deepseek-route-client` does not exist.

- [ ] **Step 3: Implement `apps/web/src/server/deepseek-route-client.ts`**

```ts
import type { JsonSchema } from "./route-ai-client";

export type DeepSeekRouteClientOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export function parseDeepSeekMessageContent<T>(payload: unknown): T | null {
  const content = (payload as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export class DeepSeekRouteClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: DeepSeekRouteClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY || "";
    this.model = options.model || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
    this.baseUrl = (options.baseUrl || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
    this.fetcher = options.fetcher || fetch;
  }

  async createJson<T>(systemPrompt: string, userPrompt: string, _schema: JsonSchema): Promise<T | null> {
    if (!this.apiKey) return null;
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\nReturn valid json only. Example keys: selectedStops, arrangementReason, skipSuggestion, weatherAlternative.`
          },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1800
      })
    });
    if (!response.ok) return null;
    return parseDeepSeekMessageContent<T>(await response.json());
  }
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `cd apps/web && npm test -- src/server/deepseek-route-client.test.ts`

Expected: PASS.

## Task 2: Provider Factory

- [ ] **Step 1: Write failing tests in `apps/web/src/server/route-ai-client.test.ts`**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createRouteAiClient } from "./route-ai-client";
import { DeepSeekRouteClient } from "./deepseek-route-client";
import { OpenAiRouteClient } from "./openai-route-client";

test("createRouteAiClient picks DeepSeek when configured", () => {
  const client = createRouteAiClient({ AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "deepseek-key" });
  assert.ok(client instanceof DeepSeekRouteClient);
});

test("createRouteAiClient defaults to OpenAI when OpenAI key exists", () => {
  const client = createRouteAiClient({ OPENAI_API_KEY: "openai-key" });
  assert.ok(client instanceof OpenAiRouteClient);
});

test("createRouteAiClient returns undefined for missing keys", () => {
  assert.equal(createRouteAiClient({ AI_PROVIDER: "deepseek" }), undefined);
  assert.equal(createRouteAiClient({ AI_PROVIDER: "openai" }), undefined);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd apps/web && npm test -- src/server/route-ai-client.test.ts`

Expected: FAIL because `route-ai-client` does not exist.

- [ ] **Step 3: Implement `apps/web/src/server/route-ai-client.ts`**

```ts
import { DeepSeekRouteClient } from "./deepseek-route-client";
import { OpenAiRouteClient } from "./openai-route-client";

export type JsonSchema = Record<string, unknown>;

export type RouteAiJsonClient = {
  createJson<T>(systemPrompt: string, userPrompt: string, schema: JsonSchema): Promise<T | null>;
};

export type AiProvider = "openai" | "deepseek";
export type AiProviderEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function createRouteAiClient(env: AiProviderEnv = process.env): RouteAiJsonClient | undefined {
  const provider = (env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "deepseek") {
    return env.DEEPSEEK_API_KEY ? new DeepSeekRouteClient() : undefined;
  }
  if (provider === "openai") {
    return env.OPENAI_API_KEY ? new OpenAiRouteClient() : undefined;
  }
  return undefined;
}
```

- [ ] **Step 4: Update `apps/web/src/server/openai-route-client.ts`**

Replace local `JsonSchema` export with:

```ts
import type { JsonSchema } from "./route-ai-client";
```

- [ ] **Step 5: Run factory tests and verify GREEN**

Run: `cd apps/web && npm test -- src/server/route-ai-client.test.ts`

Expected: PASS.

## Task 3: Planner Integration

- [ ] **Step 1: Write failing integration test in `apps/web/src/domain/real-route-planner.test.ts`**

Add a test that temporarily sets `process.env.AI_PROVIDER="deepseek"` and `process.env.DEEPSEEK_API_KEY="test-key"`, stubs `globalThis.fetch`, and verifies `generateRealRouteCard` can produce `planningMode: "ai_amap"` from DeepSeek chat completion JSON.

- [ ] **Step 2: Run the specific test and verify RED**

Run: `cd apps/web && npm test -- src/domain/real-route-planner.test.ts`

Expected before integration: FAIL because planner only constructs OpenAI from `OPENAI_API_KEY`.

- [ ] **Step 3: Modify `apps/web/src/domain/real-route-planner.ts`**

Replace direct OpenAI dependency with:

```ts
import { createRouteAiClient, type RouteAiJsonClient } from "@/server/route-ai-client";

type PlannerAiClient = RouteAiJsonClient;

export type RealRoutePlannerDeps = {
  amapClient?: PlannerAmapClient;
  aiClient?: PlannerAiClient;
};

const aiClient = deps.aiClient || createRouteAiClient();
```

Update `maybeAiArrangement` parameter names from `openAiClient` to `aiClient`.

- [ ] **Step 4: Run planner tests and verify GREEN**

Run: `cd apps/web && npm test -- src/domain/real-route-planner.test.ts`

Expected: PASS.

## Task 4: Docs And Env

- [ ] **Step 1: Update `.env.example`**

Replace legacy future provider variables with current variables:

```bash
AMAP_WEB_SERVICE_KEY=

AI_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

- [ ] **Step 2: Update product docs**

Document:

- `AMAP_WEB_SERVICE_KEY + AI_PROVIDER=openai + OPENAI_API_KEY`
- `AMAP_WEB_SERVICE_KEY + AI_PROVIDER=deepseek + DEEPSEEK_API_KEY`
- Amap-only rule fallback.

- [ ] **Step 3: Run full verification**

Run: `bash scripts/dev.sh verify`

Expected: typecheck passes, all tests pass, Next build passes.

- [ ] **Step 4: Commit implementation**

```bash
git add .
git commit -m "feat: support deepseek route ai provider"
```
