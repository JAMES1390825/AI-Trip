import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanEntryGuidance, interpretSuggestedOption } from "./plan-entry-guidance";

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
