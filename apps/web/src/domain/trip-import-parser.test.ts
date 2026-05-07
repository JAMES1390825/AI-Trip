import assert from "node:assert/strict";
import test from "node:test";
import { parseTripImportText } from "./trip-import-parser";

test("parseTripImportText extracts city places constraints and preferences from a messy note", () => {
  const draft = parseTripImportText("周六杭州，下午到。朋友推荐：西湖、法喜寺、南宋御街，想拍照和小吃，别太赶，少排队。");

  assert.equal(draft.cityHint, "杭州");
  assert.deepEqual(draft.placeNames, ["西湖", "法喜寺", "南宋御街"]);
  assert.equal(draft.mustVisitText, "西湖、法喜寺、南宋御街");
  assert.match(draft.avoidText || "", /别太赶/);
  assert.match(draft.avoidText || "", /少排队/);
  assert.ok(draft.preferenceHints.includes("拍照出片"));
  assert.ok(draft.preferenceHints.includes("吃喝逛"));
  assert.ok(draft.confidence >= 0.7);
  assert.ok(draft.parseNotes.some((note) => note.includes("杭州")));
});

test("parseTripImportText dedupes places and detects start and end hints", () => {
  const draft = parseTripImportText("从杭州东站出发，西湖 -> 法喜寺 -> 西湖，最后到湖滨银泰。不要太累，citywalk。");

  assert.deepEqual(draft.placeNames, ["西湖", "法喜寺"]);
  assert.equal(draft.startPointHint, "杭州东站");
  assert.equal(draft.endPointHint, "湖滨银泰");
  assert.ok(draft.preferenceHints.includes("citywalk"));
  assert.match(draft.avoidText || "", /不要太累/);
});

test("parseTripImportText handles family indoor and budget hints", () => {
  const draft = parseTripImportText("上海亲子两日，想去自然博物馆、武康路，预算友好，雨天尽量室内。");

  assert.equal(draft.cityHint, "上海");
  assert.ok(draft.placeNames.includes("自然博物馆"));
  assert.ok(draft.placeNames.includes("武康路"));
  assert.ok(draft.preferenceHints.includes("亲子"));
  assert.ok(draft.preferenceHints.includes("室内备选"));
  assert.ok(draft.preferenceHints.includes("预算友好"));
});

test("parseTripImportText returns low confidence for empty input", () => {
  const draft = parseTripImportText("   ");

  assert.equal(draft.rawText, "");
  assert.deepEqual(draft.placeNames, []);
  assert.deepEqual(draft.preferenceHints, []);
  assert.equal(draft.confidence, 0);
  assert.ok(draft.parseNotes.some((note) => note.includes("粘贴")));
});
