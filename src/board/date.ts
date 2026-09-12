import { DateTime, Option, Schema } from "effect";
import { format, isSameDay, isValid, parse } from "date-fns";

const dateInputFormats = ["d MMM", "d MMMM", "MMM d", "yyyy-MM-dd", "d/M", "d/M/yyyy"] as const;

export function formatTaskDate(date: Date, now = new Date()): string {
  return isSameDay(date, now) ? "Today" : format(date, "d MMM");
}

export function isTaskDateToday(value: string | undefined, now = new Date()): boolean {
  if (value === undefined) {
    return false;
  }

  const parsed = parseTaskDate(value, now);
  return parsed !== undefined && isSameDay(parsed, now);
}

export function parseTaskDate(value: string | undefined, now = new Date()): Date | undefined {
  if (value === undefined) {
    return undefined;
  }

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

export function serializeTaskDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function isCanonicalTaskDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = DateTime.make(value);
  return Option.isSome(parsed) && DateTime.formatIsoDateUtc(parsed.value) === value;
}

export const TaskDate = Schema.String.check(
  Schema.makeFilter((value) => isCanonicalTaskDate(value) || "Use a valid YYYY-MM-DD date."),
);

export function convertLegacyTaskDate(value: string, referenceDate: Date): string {
  if (isCanonicalTaskDate(value)) {
    return value;
  }
  const parsed = parseTaskDate(value, referenceDate);
  return parsed === undefined ? value : serializeTaskDate(parsed);
}

export function taskDateLabel(value: string): string {
  const parsed = parseTaskDate(value);
  return parsed === undefined ? value : formatTaskDate(parsed);
}
