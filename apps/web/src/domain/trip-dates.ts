import type { RouteCardRequest } from "./types";

export type TripDateRange = Pick<RouteCardRequest, "startDate" | "endDate" | "durationDays">;

const oneDayMs = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function deriveTripDates(startDate: string, endDate: string): TripDateRange | null {
  const normalizedStartDate = startDate.trim();
  const normalizedEndDate = (endDate || startDate).trim();
  const start = parseDateOnly(normalizedStartDate);
  const end = parseDateOnly(normalizedEndDate);
  if (!start || !end) return null;
  const diffDays = Math.round((end.getTime() - start.getTime()) / oneDayMs) + 1;
  if (diffDays !== 1 && diffDays !== 2) return null;
  return { startDate: normalizedStartDate, endDate: normalizedEndDate, durationDays: diffDays };
}
