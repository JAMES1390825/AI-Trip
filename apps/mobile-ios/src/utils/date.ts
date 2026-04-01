function pad(num: number): string {
  return String(num).padStart(2, "0");
}

export function formatISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function defaultStartDate(daysFromToday = 15): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return formatISODate(date);
}
