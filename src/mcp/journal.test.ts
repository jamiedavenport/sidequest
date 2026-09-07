import { describe, expect, it, vi } from "vitest";
import { CommandJournal, type JournalStore } from "~/mcp/journal";

function fixture() {
  const data = new Map<string, unknown>();
  const storage: JournalStore = {
    // The in-memory fixture implements the same generic structured-clone contract as DO storage.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    get: async <T>(key: string) => structuredClone(data.get(key)) as T | undefined,
    put: async (key, value) => {
      data.set(key, structuredClone(value));
    },
    delete: async (key) => {
      data.delete(key);
    },
  };
  const prepare = vi.fn(async () => ({
    operationId: "fixed-operation",
    prepared: ["fixed-task"],
    result: { operationId: "fixed-operation", affectedTaskIds: ["fixed-task"] },
  }));
  const apply = vi.fn(async () => {});
  const broadcast = vi.fn(async () => {});
  return {
    data,
    storage,
    prepare,
    apply,
    broadcast,
    journal: new CommandJournal(storage, apply, broadcast),
  };
}

describe("durable command journal", () => {
  it("returns original results on retry and rejects conflicting inputs", async () => {
    const f = fixture();
    const first = await f.journal.execute("key", "hash", f.prepare);
    expect(first.replay).toBe(false);
    expect(await f.journal.execute("key", "hash", f.prepare)).toEqual({ ...first, replay: true });
    await expect(f.journal.execute("key", "other", f.prepare)).rejects.toMatchObject({
      code: "idempotency_conflict",
    });
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.apply).toHaveBeenCalledTimes(1);
  });
  it("does not apply anything if the initial journal write fails", async () => {
    const f = fixture();
    vi.spyOn(f.storage, "put").mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(f.journal.execute("key", "hash", f.prepare)).rejects.toThrow();
    expect(f.apply).not.toHaveBeenCalled();
  });
  it("replays fixed prepared values after a failure during persistence and restart", async () => {
    const f = fixture();
    f.apply.mockRejectedValueOnce(new Error("partial persistence"));
    await expect(f.journal.execute("key", "hash", f.prepare)).rejects.toThrow();
    const restarted = new CommandJournal(f.storage, f.apply, f.broadcast);
    const recovered = await restarted.execute("key", "hash", f.prepare);
    expect(recovered.result.operationId).toBe("fixed-operation");
    expect(f.prepare).toHaveBeenCalledTimes(1);
    expect(f.apply.mock.calls[0]).toEqual(f.apply.mock.calls[1]);
  });
  it("recovers after persistence but before marking complete", async () => {
    const f = fixture();
    const put = f.storage.put.bind(f.storage);
    vi.spyOn(f.storage, "put").mockImplementation(async (key, value) => {
      if (key === "key") {
        throw new Error("complete write failed");
      }
      await put(key, value);
    });
    await expect(f.journal.execute("key", "hash", f.prepare)).rejects.toThrow();
    vi.restoreAllMocks();
    await new CommandJournal(f.storage, f.apply, f.broadcast).recover();
    expect(f.apply).toHaveBeenCalledTimes(2);
    expect(f.data.has("mcp:pending")).toBe(false);
  });
  it("restores client consistency after a failure before broadcast without reapplying", async () => {
    const f = fixture();
    f.broadcast.mockRejectedValueOnce(new Error("broadcast failed"));
    await expect(f.journal.execute("key", "hash", f.prepare)).rejects.toThrow();
    await new CommandJournal(f.storage, f.apply, f.broadcast).recover();
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.broadcast).toHaveBeenCalledTimes(2);
  });
  it("rebroadcasts safely after failure clearing the pending marker", async () => {
    const f = fixture();
    vi.spyOn(f.storage, "delete").mockRejectedValueOnce(new Error("marker deletion failed"));
    await expect(f.journal.execute("key", "hash", f.prepare)).rejects.toThrow();
    await new CommandJournal(f.storage, f.apply, f.broadcast).recover();
    expect(f.apply).toHaveBeenCalledTimes(1);
    expect(f.broadcast).toHaveBeenCalledTimes(2);
    expect(f.data.has("mcp:pending")).toBe(false);
  });
});
