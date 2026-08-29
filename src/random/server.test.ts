import { Effect } from "effect";
import { expect, test } from "vitest";

import { randomNumberProgram } from "~/random/server";

test("randomNumberProgram returns an integer between 1 and 100", async () => {
  const result = await Effect.runPromise(randomNumberProgram);

  expect(Number.isInteger(result)).toBe(true);
  expect(result).toBeGreaterThanOrEqual(1);
  expect(result).toBeLessThanOrEqual(100);
});
