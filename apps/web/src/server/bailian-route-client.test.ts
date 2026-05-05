import assert from "node:assert/strict";
import test from "node:test";
import { BailianRouteClient, parseBailianMessageContent } from "./bailian-route-client";

test("parseBailianMessageContent parses chat completion message content", () => {
  const payload = { choices: [{ message: { content: "{\"ok\":true}" } }] };

  assert.deepEqual(parseBailianMessageContent<{ ok: boolean }>(payload), { ok: true });
});

test("parseBailianMessageContent returns null for invalid or empty content", () => {
  assert.equal(parseBailianMessageContent({ choices: [{ message: { content: "{bad json" } }] }), null);
  assert.equal(parseBailianMessageContent({ choices: [{ message: { content: "" } }] }), null);
});

test("BailianRouteClient returns null without API key", async () => {
  const client = new BailianRouteClient({ apiKey: "", fetcher: async () => Response.json({}) });

  const result = await client.createJson("system", "user", { type: "object", additionalProperties: true });

  assert.equal(result, null);
});

test("BailianRouteClient posts JSON chat completion request", async () => {
  let requestUrl = "";
  let requestBody = "";
  const client = new BailianRouteClient({
    apiKey: "test-key",
    model: "qwen-test",
    baseUrl: "https://bailian.example/compatible-mode/v1/",
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
  assert.equal(requestUrl, "https://bailian.example/compatible-mode/v1/chat/completions");
  assert.match(requestBody, /qwen-test/);
  assert.match(requestBody, /json_object/);
  assert.match(requestBody, /valid json only/i);
  assert.match(requestBody, /selectedStops must be an array of objects/i);
  assert.match(requestBody, /For 1-day routes select 3 to 4 stops/i);
  assert.match(requestBody, /candidateId/i);
  assert.match(requestBody, /Do not mention non-candidate/i);
});

test("BailianRouteClient returns null for non-OK responses", async () => {
  const client = new BailianRouteClient({
    apiKey: "test-key",
    fetcher: async () => new Response("quota exceeded", { status: 429 })
  });

  const result = await client.createJson("system", "user", { type: "object", additionalProperties: true });

  assert.equal(result, null);
});
