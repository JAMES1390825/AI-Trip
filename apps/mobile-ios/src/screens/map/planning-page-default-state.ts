type PlanningEntryState = {
  destination: string;
  startDate: string;
  endDate: string;
};

export type PlanningEntryFeedback = {
  ready: boolean;
  message: string;
  focusField: "destination" | "date_range" | null;
};

export type CalendarDay = {
  date: string;
  label: string;
  inCurrentMonth: boolean;
};

export type CalendarMonth = {
  title: string;
  days: CalendarDay[];
};

function normalize(value: string): string {
  return String(value || "").trim();
}

function parseDate(value: string): Date | null {
  const ts = Date.parse(normalize(value));
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function formatISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function deriveDaysFromRange(startDate: string, endDate: string): number {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end.getTime() < start.getTime()) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function isPlanningEntryReady(state: PlanningEntryState): boolean {
  return Boolean(normalize(state.destination)) && deriveDaysFromRange(state.startDate, state.endDate) > 0;
}

export function buildPlanningEntryFeedback(state: PlanningEntryState): PlanningEntryFeedback {
  if (!normalize(state.destination)) {
    return { ready: false, message: "请先补充目的地", focusField: "destination" };
  }

  if (deriveDaysFromRange(state.startDate, state.endDate) <= 0) {
    return { ready: false, message: "请选择开始和结束日期", focusField: "date_range" };
  }

  return { ready: true, message: "", focusField: null };
}

export function applyDateRangeSelection(startDate: string, endDate: string, nextDate: string): {
  startDate: string;
  endDate: string;
} {
  const next = normalize(nextDate);
  if (!next) return { startDate, endDate };

  if (!normalize(startDate) || normalize(endDate)) {
    return { startDate: next, endDate: "" };
  }

  if (deriveDaysFromRange(startDate, next) > 0) {
    return { startDate, endDate: next };
  }

  return { startDate: next, endDate: "" };
}

export function buildCalendarMonth(anchorDate: string): CalendarMonth {
  const anchor = parseDate(anchorDate) || new Date();
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const month = firstDay.getMonth();
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 35; i += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + i);
    days.push({
      date: formatISODate(current),
      label: String(current.getDate()),
      inCurrentMonth: current.getMonth() === month,
    });
  }

  return {
    title: `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`,
    days,
  };
}
