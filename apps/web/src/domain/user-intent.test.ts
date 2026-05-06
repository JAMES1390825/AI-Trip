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

test("inferUserIntent reads preference chips and imported text", () => {
  const intent = inferUserIntent({
    themeId: "classic",
    note: "不要太赶",
    tripPreferences: ["拍照出片", "吃喝逛", "少走路"],
    importedText: "朋友收藏了南宋御街和城市阳台",
    companion: "friends",
    transportPreference: "walk_first"
  });

  assert.equal(intent.travelerProfile, "friends");
  assert.equal(intent.physicalPace, "low_walking");
  assert.ok(intent.interestWeights.photo >= 4);
  assert.ok(intent.interestWeights.food >= 4);
  assert.ok(intent.mustHaveConstraints.includes("朋友收藏了南宋御街和城市阳台"));
  assert.ok(intent.avoidConstraints.includes("步行优先但避免连续长距离暴走"));
});

test("inferUserIntent maps family and elderly request fields", () => {
  const familyIntent = inferUserIntent({
    themeId: "easy_citywalk",
    note: "",
    tripPreferences: ["亲子", "室内备选"],
    companion: "family",
    transportPreference: "public_transit_ok"
  });

  assert.equal(familyIntent.travelerProfile, "kids");
  assert.ok(familyIntent.interestWeights.rainSafety >= 3);
  assert.ok(familyIntent.mustHaveConstraints.includes("适合亲子同行"));
  assert.ok(familyIntent.avoidConstraints.includes("优先公共交通可达"));
});
