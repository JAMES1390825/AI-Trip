import assert from "node:assert/strict";
import test from "node:test";
import { formatApiFailureMessage, formatApiNetworkMessage, formatApiTimeoutMessage } from "./client";

test("formatApiFailureMessage keeps backend detail but does not expose method or path", () => {
  const text = formatApiFailureMessage(400, "planning_brief is not ready_to_generate");
  assert.equal(text, "planning_brief is not ready_to_generate");
  assert.equal(text.includes("POST /api/v1"), false);
});

test("formatApiFailureMessage falls back to generic request text", () => {
  assert.equal(formatApiFailureMessage(500, ""), "请求失败（500），请稍后再试");
});

test("formatApiTimeoutMessage hides transport details", () => {
  assert.equal(formatApiTimeoutMessage(), "请求超时，请稍后再试");
});

test("formatApiNetworkMessage hides internal service names", () => {
  assert.equal(formatApiNetworkMessage(), "当前无法连接服务，请稍后再试");
});
