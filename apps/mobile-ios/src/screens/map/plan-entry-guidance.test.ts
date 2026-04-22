import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanEntryGuidance,
  interpretSuggestedOption,
  resolveMissingFieldsAfterSuggestion,
} from "./plan-entry-guidance";

test("buildPlanEntryGuidance prefers destination search when destination is missing", () => {
  const guidance = buildPlanEntryGuidance({
    missingFields: ["destination"],
    nextAction: "CONFIRM_DESTINATION",
    clarificationQuestion: "我还需要你先确认目的地城市。",
    suggestedOptions: ["杭州"],
  });

  assert.equal(guidance.needsCompletion, true);
  assert.equal(guidance.primaryAction?.kind, "OPEN_DESTINATION_SEARCH");
  assert.equal(guidance.highlights.destination, true);
  assert.equal(guidance.highlights.schedule, false);
});

test("buildPlanEntryGuidance opens the date picker when start date is missing", () => {
  const guidance = buildPlanEntryGuidance({
    missingFields: ["start_date"],
    nextAction: "CONFIRM_START_DATE",
    clarificationQuestion: "我还需要你补一个开始日期。",
    suggestedOptions: ["2026-05-01"],
  });

  assert.equal(guidance.primaryAction?.kind, "OPEN_DATE_PICKER");
  assert.equal(guidance.highlights.schedule, true);
});

test("interpretSuggestedOption extracts day count for CONFIRM_DAYS", () => {
  const action = interpretSuggestedOption("CONFIRM_DAYS", "玩 4 天");

  assert.deepEqual(action, {
    kind: "SET_DAYS",
    value: "玩 4 天",
    days: 4,
  });
});

test("interpretSuggestedOption returns a start date for CONFIRM_START_DATE", () => {
  const action = interpretSuggestedOption("CONFIRM_START_DATE", "2026-05-01");

  assert.deepEqual(action, {
    kind: "SET_START_DATE",
    value: "2026-05-01",
    startDate: "2026-05-01",
  });
});

test("interpretSuggestedOption falls back to note append when option is not directly actionable", () => {
  const action = interpretSuggestedOption("COMPLETE_FORM", "多一点本地餐馆");

  assert.deepEqual(action, {
    kind: "APPEND_NOTE",
    value: "多一点本地餐馆",
  });
});

test("interpretSuggestedOption keeps destination text for destination confirmation", () => {
  const action = interpretSuggestedOption("CONFIRM_DESTINATION", "杭州");

  assert.deepEqual(action, {
    kind: "SET_DESTINATION",
    value: "杭州",
  });
});

test("resolveMissingFieldsAfterSuggestion removes fulfilled schedule field", () => {
  const next = resolveMissingFieldsAfterSuggestion(["days", "start_date"], {
    kind: "SET_DAYS",
    value: "玩 4 天",
    days: 4,
  });

  assert.deepEqual(next, ["start_date"]);
});

test("resolveMissingFieldsAfterSuggestion removes destination once a destination is applied", () => {
  const next = resolveMissingFieldsAfterSuggestion(["destination"], {
    kind: "SET_DESTINATION",
    value: "杭州",
  });

  assert.deepEqual(next, []);
});

test("buildPlanEntryGuidance hides completion UI when nothing is missing", () => {
  const guidance = buildPlanEntryGuidance({
    missingFields: [],
    nextAction: "GENERATE",
    clarificationQuestion: "",
    suggestedOptions: [],
  });

  assert.equal(guidance.needsCompletion, false);
  assert.equal(guidance.primaryAction, null);
});
