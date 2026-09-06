import { parseSync, type Comment, type Statement } from "@tsrx/oxc/parser";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import formatterConfig from "../.oxfmtrc.json";

const spacedDeclarations = new Set([
  "VariableDeclaration",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "ClassDeclaration",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "ExportNamedDeclaration",
  "ExportDefaultDeclaration",
  "ExportAllDeclaration",
]);

function declaration(statement: Statement) {
  return statement.type === "ExportNamedDeclaration" ||
    statement.type === "ExportDefaultDeclaration"
    ? (statement.declaration ?? statement)
    : statement;
}

function isRelatedPair(previous: Statement, next: Statement): boolean {
  const left = declaration(previous);
  const right = declaration(next);
  if (left.type === "VariableDeclaration" && right.type === "TSTypeAliasDeclaration") {
    return left.declarations.some(
      (item) => item.id.type === "Identifier" && item.id.name === right.id.name,
    );
  }
  return (
    left.type === "TSDeclareFunction" &&
    (right.type === "TSDeclareFunction" || right.type === "FunctionDeclaration") &&
    left.id?.name === right.id?.name
  );
}

function paddingBoundary(
  source: string,
  start: number,
  end: number,
  comments: readonly Comment[],
): number | undefined {
  let boundary = start;
  let cursor = start;
  for (const comment of comments) {
    const gap = source.slice(cursor, comment.start);
    if (/\r?\n[\t ]*\r?\n/u.test(gap)) return undefined;
    // Keep trailing comments with the preceding declaration, and leading comments with the next.
    if (cursor === boundary && !gap.includes("\n")) boundary = comment.end;
    cursor = comment.end;
  }
  return /\r?\n[\t ]*\r?\n/u.test(source.slice(cursor, end)) ? undefined : boundary;
}

/** Check authored source so TSRX function boundaries and fix offsets are preserved. */
export function spaceDeclarations(
  filename: string,
  source: string,
): { source: string; lines: number[] } {
  const parsed = parseSync(filename, source);
  if (parsed.errors.length > 0 || parsed.program === null) {
    throw new Error(
      `${filename}: ${parsed.errors.map((error) => error.message).join("; ") || "Unable to parse source"}`,
    );
  }
  const statements = parsed.program.body;
  const edits: { offset: number; text: string }[] = [];
  const lines: number[] = [];
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let commentIndex = 0;
  for (let index = 1; index < statements.length; index += 1) {
    const previous = statements[index - 1];
    const next = statements[index];
    if (!previous || !next) continue;
    if (
      (!spacedDeclarations.has(previous.type) && !spacedDeclarations.has(next.type)) ||
      isRelatedPair(previous, next)
    )
      continue;
    let comment = parsed.comments[commentIndex];
    while (comment && comment.end <= previous.end) comment = parsed.comments[++commentIndex];
    const comments: Comment[] = [];
    while (comment && comment.start < next.start) {
      comments.push(comment);
      comment = parsed.comments[++commentIndex];
    }
    const boundary = paddingBoundary(source, previous.end, next.start, comments);
    if (boundary === undefined) continue;
    edits.push({
      offset: boundary,
      text: source.slice(boundary, next.start).includes("\n") ? newline : newline.repeat(2),
    });
    lines.push(source.slice(0, next.start).split("\n").length);
  }
  for (const edit of edits.toReversed())
    source = source.slice(0, edit.offset) + edit.text + source.slice(edit.offset);
  return { source, lines };
}

function isSourceFile(path: string): boolean {
  return (
    /\.(?:[cm]?[jt]sx?|tsrx)$/u.test(path) &&
    existsSync(path) &&
    !formatterConfig.ignorePatterns.some((pattern) => matchesGlob(path, pattern))
  );
}

function sourceFiles(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(isSourceFile);
}

function main(): void {
  const [mode, ...paths] = process.argv.slice(2);
  if (mode !== "--check" && mode !== "--write")
    throw new Error("Usage: declaration-spacing.ts --check|--write [files...]");
  let changed = 0;
  for (const path of paths.length > 0 ? paths.filter(isSourceFile) : sourceFiles()) {
    const result = spaceDeclarations(path, readFileSync(path, "utf8"));
    if (result.lines.length === 0) continue;
    changed += 1;
    if (mode === "--write") writeFileSync(path, result.source);
    else
      for (const line of result.lines)
        console.error(`${path}:${line}: Expected a blank line between declarations.`);
  }
  if (mode === "--check" && changed > 0) process.exitCode = 1;
  else
    console.log(
      mode === "--write"
        ? `Declaration spacing: updated ${changed} file(s).`
        : "Declaration spacing: all files pass.",
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
