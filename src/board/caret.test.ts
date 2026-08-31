import { describe, expect, it } from "vitest";

import { isCaretOnFirstLine } from "~/board/caret";

describe("isCaretOnFirstLine", () => {
  it("treats an empty field as the first line", () => {
    expect(isCaretOnFirstLine("", 0)).toBe(true);
  });

  it("is true anywhere on a single line", () => {
    expect(isCaretOnFirstLine("hello", 0)).toBe(true);
    expect(isCaretOnFirstLine("hello", 5)).toBe(true);
  });

  it("is true before the first line break", () => {
    expect(isCaretOnFirstLine("hello\nworld", 0)).toBe(true);
    expect(isCaretOnFirstLine("hello\nworld", 5)).toBe(true);
  });

  it("is false on later lines", () => {
    expect(isCaretOnFirstLine("hello\nworld", 6)).toBe(false);
    expect(isCaretOnFirstLine("hello\nworld", 11)).toBe(false);
  });
});
