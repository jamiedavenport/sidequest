import { ToolError, type ToolResult } from "~/mcp/schema";

export type JournalEntry<T> = {
  key: string;
  hash: string;
  operationId: string;
  prepared: T;
  result: ToolResult;
  complete: boolean;
};

export type JournalStore = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<unknown>;
};

const pendingKey = "mcp:pending";

/** Call only while holding the board's shared serialization queue. */
export class CommandJournal<T> {
  constructor(
    private readonly storage: JournalStore,
    private readonly apply: (entry: JournalEntry<T>) => Promise<void>,
    private readonly broadcast: () => Promise<void>,
  ) {}

  async recover(): Promise<void> {
    const pending = await this.storage.get<JournalEntry<T>>(pendingKey);
    if (!pending) {
      return;
    }
    const stored = await this.storage.get<JournalEntry<T>>(pending.key);
    if (!stored?.complete) {
      await this.apply(pending);
      await this.storage.put(pending.key, { ...pending, complete: true });
    }
    // A full snapshot also repairs a crash after persistence but before any client saw the commit.
    await this.broadcast();
    await this.storage.delete(pendingKey);
  }

  async execute(
    key: string,
    hash: string,
    prepare: () => Promise<Omit<JournalEntry<T>, "key" | "hash" | "complete">>,
  ): Promise<{ result: ToolResult; replay: boolean }> {
    await this.recover();
    const previous = await this.storage.get<JournalEntry<T>>(key);
    if (previous) {
      if (previous.hash !== hash) {
        throw new ToolError({
          code: "idempotency_conflict",
          message:
            "This idempotency key was already used for different arguments or a different tool.",
        });
      }
      return { result: previous.result, replay: true };
    }
    const entry = { ...(await prepare()), key, hash, complete: false };
    await this.storage.put(pendingKey, entry);
    await this.recover();
    return { result: entry.result, replay: false };
  }
}
