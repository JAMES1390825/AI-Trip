import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekRouteClient } from "./deepseek-route-client";
import { OpenAiRouteClient } from "./openai-route-client";
import { createRouteAiClient } from "./route-ai-client";

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

test("createRouteAiClient returns undefined for unsupported provider", () => {
  assert.equal(createRouteAiClient({ AI_PROVIDER: "unknown", OPENAI_API_KEY: "openai-key" }), undefined);
});
