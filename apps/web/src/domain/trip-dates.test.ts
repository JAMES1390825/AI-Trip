import assert from "node:assert/strict";
import test from "node:test";
import { deriveTripDates } from "./trip-dates";

test("deriveTripDates derives inclusive one and two day ranges", () => {
  assert.deepEqual(deriveTripDates("2026-05-10", "2026-05-10"), {
    startDate: "2026-05-10",
    endDate: "2026-05-10",
    durationDays: 1
  });
  assert.deepEqual(deriveTripDates("2026-05-10", "2026-05-11"), {
    startDate: "2026-05-10",
    endDate: "2026-05-11",
    durationDays: 2
  });
});

test("deriveTripDates rejects unsupported or reversed ranges", () => {
  assert.equal(deriveTripDates("", "2026-05-11"), null);
  assert.equal(deriveTripDates("2026-05-11", "2026-05-10"), null);
  assert.equal(deriveTripDates("2026-05-10", "2026-05-12"), null);
});
