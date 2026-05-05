import assert from "node:assert/strict";
import test from "node:test";
import { inferUserIntent } from "./user-intent";

test("inferUserIntent extracts relaxed photo intent from note and theme", () => {
  const intent = inferUserIntent({
    themeId: "easy_citywalk",
    note: "想拍照，别太累，下午出发"
  });

  assert.equal(intent.physicalPace, "relaxed");
  assert.equal(intent.startRhythm, "afternoon_start");
  assert.ok(intent.interestWeights.photo > intent.interestWeights.shopping);
  assert.ok(intent.avoidConstraints.includes("别太累"));
  assert.match(intent.intentSummary, /轻松|拍照/);
});

test("inferUserIntent extracts family and budget constraints", () => {
  const intent = inferUserIntent({
    themeId: "low_budget",
    note: "带爸妈，预算低，少走路"
  });

  assert.equal(intent.travelerProfile, "parents");
  assert.equal(intent.budgetPosture, "low");
  assert.equal(intent.physicalPace, "low_walking");
  assert.ok(intent.mustHaveConstraints.includes("带爸妈"));
});
