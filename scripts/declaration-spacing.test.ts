import { describe, expect, it } from "vitest";

import { spaceDeclarations } from "./declaration-spacing";

function check(source: string, filename = "example.ts") {
  const result = spaceDeclarations(filename, source);
  expect(spaceDeclarations(filename, result.source).lines).toEqual([]);
  return result.source;
}

describe("declaration spacing", () => {
  it("separates declarations while keeping imports and matching schema types together", () => {
    const source = `import { Schema } from "effect";
import type { Option } from "effect";
export const User = Schema.Struct({ name: Schema.String });
export type User = typeof User.Type;
export const Item = Schema.String;
export type Item = typeof Item.Type;
interface Props { value: string }
class View {}
function render() {}
const finish = () => {};
const cleanup = () => {};`;
    expect(check(source)).toBe(`import { Schema } from "effect";
import type { Option } from "effect";

export const User = Schema.Struct({ name: Schema.String });
export type User = typeof User.Type;

export const Item = Schema.String;
export type Item = typeof Item.Type;

interface Props { value: string }

class View {}

function render() {}

const finish = () => {};

const cleanup = () => {};`);
  });

  it("preserves TSRX render blocks and separates exported and private components", () => {
    const source =
      "function First() @{ <div>first</div>; }\nexport function Second() @{ <First />; }\nfunction helper() { return 1; }";
    expect(check(source, "example.tsrx")).toBe(
      "function First() @{ <div>first</div>; }\n\nexport function Second() @{ <First />; }\n\nfunction helper() { return 1; }",
    );
  });

  it("preserves Unicode, CRLF, trailing comments and leading JSDoc", () => {
    const source =
      'const title = "😀 café"; // previous\r\n/**\r\n * Next declaration.\r\n *\r\n * Its documentation stays attached.\r\n */\r\nexport function next() {}';
    expect(check(source)).toBe(source.replace("// previous\r\n", "// previous\r\n\r\n"));
  });

  it("preserves existing spacing and comments without changing function bodies", () => {
    const source =
      "function first() { const a = 1; const b = 2; return a + b; }\n\n// next\nfunction second() {}";
    expect(check(source)).toBe(source);
  });

  it("separates functions sharing a line", () => {
    expect(check("function first() {} function second() {}")).toBe(
      "function first() {}\n\n function second() {}",
    );
  });

  it("keeps overload signatures and their implementation together", () => {
    const source =
      "export function read(value: string): string;\nexport function read(value: number): number;\nexport function read(value: string | number) { return value; }\nexport function other() {}";
    expect(check(source)).toBe(
      source.replace("\nexport function other", "\n\nexport function other"),
    );
  });

  it("rejects invalid source without attempting a rewrite", () => {
    expect(() => spaceDeclarations("broken.tsrx", "function Broken() @{ <div> }")).toThrow(
      "broken.tsrx",
    );
  });
});
