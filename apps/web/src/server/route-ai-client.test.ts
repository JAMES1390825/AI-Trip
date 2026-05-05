import assert from "node:assert/strict";
import test from "node:test";
import { BailianRouteClient } from "./bailian-route-client";
import { DeepSeekRouteClient } from "./deepseek-route-client";
import { OpenAiRouteClient } from "./openai-route-client";
import { createRouteAiClient } from "./route-ai-client";

test("createRouteAiClient picks DeepSeek when configured", () => {
  const client = createRouteAiClient({ AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "deepseek-key" });

  assert.ok(client instanceof DeepSeekRouteClient);
});

test("createRouteAiClient picks Bailian when configured", () => {
  const client = createRouteAiClient({ AI_PROVIDER: "bailian", BAILIAN_API_KEY: "bailian-key" });

  assert.ok(client instanceof BailianRouteClient);
});

test("createRouteAiClient defaults to OpenAI when OpenAI key exists", () => {
  const client = createRouteAiClient({ OPENAI_API_KEY: "openai-key" });

  assert.ok(client instanceof OpenAiRouteClient);
});

test("createRouteAiClient returns undefined for missing keys", () => {
  assert.equal(createRouteAiClient({ AI_PROVIDER: "deepseek" }), undefined);
  assert.equal(createRouteAiClient({ AI_PROVIDER: "bailian" }), undefined);
  assert.equal(createRouteAiClient({ AI_PROVIDER: "openai" }), undefined);
});

test("createRouteAiClient returns undefined for unsupported provider", () => {
  assert.equal(createRouteAiClient({ AI_PROVIDER: "unknown", OPENAI_API_KEY: "openai-key" }), undefined);
});
