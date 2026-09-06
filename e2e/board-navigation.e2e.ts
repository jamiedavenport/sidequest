import { expect, test } from "@playwright/test";

test("board providers isolate state, keep snapshots stable and clean up subscriptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/e2e/support/navigation-harness.tsrx";
    const harness = await import(/* @vite-ignore */ modulePath);
    return harness.checkProviders();
  });
  expect(result).toEqual({
    initial: "todaytoday",
    updated: "projecttoday",
    rerendered: "projecttoday",
    active: [1, 1],
    removed: [0, 0],
    rendersAfterUnmount: 0,
  });
  expect(errors).toEqual([]);
});
