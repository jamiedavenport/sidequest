import { format, isSameDay, isValid, parse } from "date-fns";

const dateInputFormats = ["d MMM", "d MMMM", "MMM d", "yyyy-MM-dd", "d/M", "d/M/yyyy"] as const;

export function formatTaskDate(date: Date, now = new Date()): string {
  return isSameDay(date, now) ? "Today" : format(date, "d MMM");
}

export function parseTaskDate(value: string, now = new Date()): Date | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  if (/^today$/i.test(trimmed)) {
    return now;
  }

  for (const pattern of dateInputFormats) {
    const parsed = parse(trimmed, pattern, now);
    if (isValid(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
