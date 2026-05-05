import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiRouteClient, parseStructuredOutputText } from "./openai-route-client";

test("parseStructuredOutputText parses Responses API output text", () => {
  const payload = {
    output: [{ content: [{ type: "output_text", text: "{\"summary\":\"轻松拍照\"}" }] }]
  };

  assert.deepEqual(parseStructuredOutputText<{ summary: string }>(payload), { summary: "轻松拍照" });
});

test("OpenAiRouteClient returns null without API key", async () => {
  const client = new OpenAiRouteClient({ apiKey: "", fetcher: async () => Response.json({}) });

  const result = await client.createJson("system", "user", { type: "object", additionalProperties: true });

  assert.equal(result, null);
});

test("OpenAiRouteClient posts structured output request", async () => {
  let requestBody = "";
  const client = new OpenAiRouteClient({
    apiKey: "test-key",
    model: "test-model",
    fetcher: async (_url, init) => {
      requestBody = String(init?.body || "");
      return Response.json({ output: [{ content: [{ type: "output_text", text: "{\"ok\":true}" }] }] });
    }
  });

  const result = await client.createJson<{ ok: boolean }>(
    "system",
    "user",
    { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  );

  assert.deepEqual(result, { ok: true });
  assert.match(requestBody, /test-model/);
  assert.match(requestBody, /json_schema/);
});
