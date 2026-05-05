import assert from "node:assert/strict";
import test from "node:test";
import { DeepSeekRouteClient, parseDeepSeekMessageContent } from "./deepseek-route-client";

test("parseDeepSeekMessageContent parses chat completion message content", () => {
  const payload = { choices: [{ message: { content: "{\"ok\":true}" } }] };

  assert.deepEqual(parseDeepSeekMessageContent<{ ok: boolean }>(payload), { ok: true });
});

test("parseDeepSeekMessageContent returns null for invalid or empty content", () => {
  assert.equal(parseDeepSeekMessageContent({ choices: [{ message: { content: "{bad json" } }] }), null);
  assert.equal(parseDeepSeekMessageContent({ choices: [{ message: { content: "" } }] }), null);
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
    baseUrl: "https://deepseek.example/",
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
  assert.match(requestBody, /valid json only/i);
});

test("DeepSeekRouteClient returns null for non-OK responses", async () => {
  const client = new DeepSeekRouteClient({
    apiKey: "test-key",
    fetcher: async () => new Response("rate limited", { status: 429 })
  });

  const result = await client.createJson("system", "user", { type: "object", additionalProperties: true });

  assert.equal(result, null);
});
