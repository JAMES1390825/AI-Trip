import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDateRangeSelection,
  buildCalendarMonth,
  buildPlanningEntryFeedback,
  deriveDaysFromRange,
  isPlanningEntryReady,
} from "./planning-page-default-state";

test("isPlanningEntryReady requires destination and date range only", () => {
  assert.equal(
    isPlanningEntryReady({
      destination: "上海",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    }),
    true,
  );

  assert.equal(
    isPlanningEntryReady({
      destination: "",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    }),
    false,
  );
});

test("deriveDaysFromRange returns inclusive day count", () => {
  assert.equal(deriveDaysFromRange("2026-05-01", "2026-05-03"), 3);
  assert.equal(deriveDaysFromRange("2026-05-01", "2026-05-01"), 1);
});

test("deriveDaysFromRange returns 0 for inverted ranges", () => {
  assert.equal(deriveDaysFromRange("2026-05-03", "2026-05-01"), 0);
});

test("buildPlanningEntryFeedback returns destination-first message", () => {
  const feedback = buildPlanningEntryFeedback({
    destination: "",
    startDate: "",
    endDate: "",
  });

  assert.equal(feedback.message, "请先补充目的地");
  assert.equal(feedback.focusField, "destination");
});

test("buildPlanningEntryFeedback points to date when destination exists but range is incomplete", () => {
  const feedback = buildPlanningEntryFeedback({
    destination: "杭州",
    startDate: "2026-05-01",
    endDate: "",
  });

  assert.equal(feedback.message, "请选择开始和结束日期");
  assert.equal(feedback.focusField, "date_range");
});

test("buildPlanningEntryFeedback clears message when destination and date range are complete", () => {
  const feedback = buildPlanningEntryFeedback({
    destination: "上海",
    startDate: "2026-05-01",
    endDate: "2026-05-03",
  });

  assert.equal(feedback.ready, true);
  assert.equal(feedback.message, "");
});

test("applyDateRangeSelection starts a fresh range on first click", () => {
  const range = applyDateRangeSelection("", "", "2026-05-01");
  assert.deepEqual(range, { startDate: "2026-05-01", endDate: "" });
});

test("applyDateRangeSelection fills the end date on second forward click", () => {
  const range = applyDateRangeSelection("2026-05-01", "", "2026-05-03");
  assert.deepEqual(range, { startDate: "2026-05-01", endDate: "2026-05-03" });
});

test("applyDateRangeSelection resets when the second click is before the start date", () => {
  const range = applyDateRangeSelection("2026-05-03", "", "2026-05-01");
  assert.deepEqual(range, { startDate: "2026-05-01", endDate: "" });
});

test("buildCalendarMonth returns a visible month grid including outside-month days", () => {
  const month = buildCalendarMonth("2026-05-01");
  assert.equal(month.title, "2026年5月");
  assert.equal(month.days.length, 35);
  assert.equal(month.days.some((item) => item.date === "2026-05-01"), true);
  assert.equal(month.days.some((item) => item.inCurrentMonth === false), true);
});
