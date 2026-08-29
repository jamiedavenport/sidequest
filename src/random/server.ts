import { createServerFn } from "@tanstack/react-start";
import { Effect, Random } from "effect";

export const randomNumberProgram = Random.nextIntBetween(1, 100).pipe(
  Effect.delay("150 millis"),
  Effect.withSpan("randomNumber.generate"),
);

export const getRandomNumber = createServerFn({ method: "GET" }).handler(() => {
  return Effect.runPromise(randomNumberProgram);
});
