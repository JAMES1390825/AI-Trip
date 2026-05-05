# Bailian Route AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Alibaba Cloud Bailian Model Studio as a selectable AI provider for real Amap route arrangement.

**Architecture:** Reuse the existing provider-neutral `RouteAiJsonClient` interface. Add a Bailian OpenAI-compatible Chat Completions adapter, extend provider selection, and keep route validation unchanged.

**Tech Stack:** Next.js, TypeScript, Node test runner, Fetch API, Amap, Alibaba Cloud Bailian Model Studio OpenAI-compatible API.

---

## File Structure

- Create `apps/web/src/server/bailian-route-client.ts`: Bailian JSON chat adapter.
- Create `apps/web/src/server/bailian-route-client.test.ts`: Bailian adapter tests.
- Modify `apps/web/src/server/route-ai-client.ts`: add provider selection.
- Modify `apps/web/src/server/route-ai-client.test.ts`: add Bailian factory coverage.
- Modify `apps/web/src/domain/real-route-planner.test.ts`: add mocked Bailian integration coverage.
- Modify `.env.example`: document Bailian variables.
- Modify `docs/product/citywalk-route-cards-api.md`: document Bailian mode.
- Modify `docs/product/citywalk-route-cards-architecture.md`: document Bailian provider.

## Task 1: Bailian Client

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/server/bailian-route-client.test.ts` with tests for parsing, missing key, request shape, and non-OK responses.

- [ ] **Step 2: Verify RED**

Run: `cd apps/web && npm test -- src/server/bailian-route-client.test.ts`

Expected: FAIL because `bailian-route-client` does not exist.

- [ ] **Step 3: Implement Bailian client**

Create `apps/web/src/server/bailian-route-client.ts` with:

- `parseBailianMessageContent`
- `BailianRouteClient`
- default base URL `https://dashscope.aliyuncs.com/compatible-mode/v1`
- default model `qwen-plus`
- `response_format: { type: "json_object" }`

- [ ] **Step 4: Verify GREEN**

Run: `cd apps/web && npm test -- src/server/bailian-route-client.test.ts`

Expected: PASS.

## Task 2: Provider Factory

- [ ] **Step 1: Add failing factory test**

Add a test to `apps/web/src/server/route-ai-client.test.ts`:

```ts
test("createRouteAiClient picks Bailian when configured", () => {
  const client = createRouteAiClient({ AI_PROVIDER: "bailian", BAILIAN_API_KEY: "bailian-key" });
  assert.ok(client instanceof BailianRouteClient);
});
```

- [ ] **Step 2: Verify RED**

Run: `cd apps/web && npm test -- src/server/route-ai-client.test.ts`

Expected: FAIL because the factory does not support Bailian yet.

- [ ] **Step 3: Extend factory**

Modify `apps/web/src/server/route-ai-client.ts`:

- import `BailianRouteClient`
- update `AiProvider`
- return `new BailianRouteClient()` when `AI_PROVIDER=bailian` and `BAILIAN_API_KEY` exists

- [ ] **Step 4: Verify GREEN**

Run: `cd apps/web && npm test -- src/server/route-ai-client.test.ts`

Expected: PASS.

## Task 3: Route Planner Integration

- [ ] **Step 1: Add failing integration test**

Add a test to `apps/web/src/domain/real-route-planner.test.ts` that sets:

```ts
process.env.AI_PROVIDER = "bailian";
process.env.BAILIAN_API_KEY = "test-bailian-key";
```

Mock `globalThis.fetch` to return a valid Chat Completions JSON arrangement and assert:

- `planningMode === "ai_amap"`
- the first stop follows the mocked Bailian order

- [ ] **Step 2: Verify RED**

Run: `cd apps/web && npm test -- src/domain/real-route-planner.test.ts`

Expected: FAIL before factory integration, PASS after Task 2. If Task 2 already made it pass, keep the test as regression coverage.

- [ ] **Step 3: Verify route planner tests**

Run: `cd apps/web && npm test -- src/domain/real-route-planner.test.ts`

Expected: PASS.

## Task 4: Docs, Env, Verification

- [ ] **Step 1: Update `.env.example`**

Add:

```bash
BAILIAN_API_KEY=
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
BAILIAN_MODEL=qwen-plus
```

- [ ] **Step 2: Update product docs**

Document `AMAP_WEB_SERVICE_KEY + AI_PROVIDER=bailian + BAILIAN_API_KEY`.

- [ ] **Step 3: Run full verification**

Run: `bash scripts/dev.sh verify`

Expected: typecheck passes, all tests pass, Next build passes.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add .
git commit -m "feat: support bailian route ai provider"
```
