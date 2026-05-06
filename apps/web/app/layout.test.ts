import assert from "node:assert/strict";
import test from "node:test";
import { metadata } from "./metadata";

test("metadata describes AI Trip as a Chinese-first travel planning app", () => {
  assert.equal(metadata.title, "AI Trip - AI 旅行规划");
  assert.match(String(metadata.description), /真实地点/);
  assert.match(String(metadata.description), /公开攻略证据/);
  assert.match(String(metadata.description), /可执行行程/);
});
