import { Effect } from "effect";
import { calendarError, type CalendarState } from "./schema";

const calendarStateKey = "google:calendar";

export class CalendarStore {
  constructor(private readonly storage: Pick<DurableObjectStorage, "get" | "put" | "delete">) {}

  read = Effect.fn("CalendarStore.read")(() =>
    Effect.tryPromise({
      try: () => this.storage.get<CalendarState>(calendarStateKey),
      catch: () => calendarError("Could not read Calendar sync settings."),
    }),
  );

  save = Effect.fn("CalendarStore.save")((state: CalendarState) =>
    Effect.tryPromise({
      try: () => this.storage.put(calendarStateKey, state),
      catch: () => calendarError("Could not save Calendar sync progress. Please retry."),
    }),
  );

  clear = Effect.fn("CalendarStore.clear")(() =>
    Effect.tryPromise({
      try: () => this.storage.delete(calendarStateKey),
      catch: () => calendarError("Could not clear Calendar sync settings. Please retry."),
    }),
  );
}
