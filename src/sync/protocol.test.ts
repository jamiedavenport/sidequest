import { describe, expect, it } from "vitest";

import { Ack, acknowledgedChanges, Changes, Mutation } from "~/sync/protocol";

describe("acknowledgedChanges", () => {
  it("delivers the acknowledgement before the authoritative change echo", () => {
    const [first, second] = acknowledgedChanges({
      changeId: "change-1",
      mutations: [
        new Mutation({
          collection: "tasks",
          key: "task-1",
          type: "update",
          value: { completed: true, id: "task-1" },
        }),
      ],
      transactionId: "transaction-1",
    });

    expect(first).toBeInstanceOf(Ack);
    expect(first.transactionId).toBe("transaction-1");
    expect(second).toBeInstanceOf(Changes);
    expect(second.changeId).toBe("change-1");
    expect(second.originatingTransactionId).toBe("transaction-1");
  });
});
