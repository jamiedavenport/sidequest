export function isCaretOnFirstLine(value: string, selectionStart: number): boolean {
  return !value.slice(0, selectionStart).includes("\n");
}
