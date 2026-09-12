import { Effect, Semaphore } from "effect";
import type { CalendarClient } from "./api";
import { buildCalendarEvents, sameCalendarEvent, type CalendarBoard } from "./events";
import { calendarError, type CalendarState, type GoogleCalendarError } from "./schema";
import { reconcileCalendar } from "./reconcile";
import type { CalendarStore } from "./store";

type CalendarDependencies = {
  store: CalendarStore;
  client: CalendarClient;
  readBoard: () => Effect.Effect<CalendarBoard, GoogleCalendarError>;
  getAccount: (userId: string) => Effect.Effect<{ id: string }, GoogleCalendarError>;
  getToken: (userId: string, accountId: string) => Effect.Effect<string, GoogleCalendarError>;
  datesMigrated: () => Effect.Effect<boolean, GoogleCalendarError>;
};

/** Calendar serialization is independent of board writes; snapshots take only the board lock. */
export class GoogleCalendarSync {
  private readonly gate = Semaphore.makeUnsafe(1);

  constructor(private readonly dependencies: CalendarDependencies) {}

  getStatus = Effect.fn("GoogleCalendarSync.getStatus")(() =>
    this.dependencies.store.read().pipe(
      Effect.map((state) => ({
        enabled: !!state,
        accountId: state?.accountId,
        error: state?.error ?? null,
      })),
    ),
  );

  private enableCalendar = Effect.fn("GoogleCalendarSync.enableCalendar")(function* (
    this: GoogleCalendarSync,
    userId: string,
  ) {
    const { store, client, datesMigrated, getAccount, getToken } = this.dependencies;
    if (!(yield* datesMigrated())) {
      return yield* calendarError("Open settings again to convert your existing due dates.");
    }
    let state = yield* store.read();
    if (!state) {
      const linked = yield* getAccount(userId);
      const token = yield* getToken(userId, linked.id);
      const calendarId = yield* client.createCalendar(token);
      state = { enabled: true, accountId: linked.id, calendarId, events: {}, error: null };
      yield* store.save(state);
    }
    yield* this.syncCalendar(userId, state);
    return undefined;
  });

  private disableCalendar = Effect.fn("GoogleCalendarSync.disableCalendar")(function* (
    this: GoogleCalendarSync,
    userId: string,
  ) {
    const { store, client, getToken } = this.dependencies;
    const state = yield* store.read();
    if (!state) {
      return;
    }
    const token = yield* getToken(userId, state.accountId);
    yield* client.deleteCalendar(token, state.calendarId);
    yield* store.clear();
  });

  private saveFailure = Effect.fn("GoogleCalendarSync.saveFailure")(function* (
    this: GoogleCalendarSync,
    error: GoogleCalendarError,
  ) {
    const state = yield* this.dependencies.store.read();
    const failure = { message: error.message, reconnect: error.reconnect };
    if (state) {
      yield* this.dependencies.store.save({ ...state, error: failure });
    }
    return { enabled: !!state, accountId: state?.accountId, error: failure };
  });

  setEnabled = Effect.fn("GoogleCalendarSync.setEnabled")((userId: string, enabled: boolean) =>
    (enabled ? this.enableCalendar(userId) : this.disableCalendar(userId)).pipe(
      Effect.flatMap(() => this.getStatus()),
      Effect.catch((error) => this.saveFailure(error)),
      (work) => this.gate.withPermit(work),
    ),
  );

  private syncCalendar = Effect.fn("GoogleCalendarSync.syncCalendar")(function* (
    this: GoogleCalendarSync,
    userId: string,
    state: CalendarState,
  ) {
    const { store, client, readBoard, getToken } = this.dependencies;
    const desired = buildCalendarEvents(yield* readBoard());
    const unchanged =
      desired.size === Object.keys(state.events).length &&
      [...desired].every(
        ([date, content]) =>
          state.events[date] && sameCalendarEvent(state.events[date].content, content),
      );
    if (unchanged && !state.error) {
      return;
    }
    const token = yield* getToken(userId, state.accountId);
    yield* reconcileCalendar(client, store, state, token, desired);
  });

  reconcile = Effect.fn("GoogleCalendarSync.reconcile")((userId: string) =>
    this.dependencies.store.read().pipe(
      Effect.flatMap((state) => (state ? this.syncCalendar(userId, state) : Effect.void)),
      Effect.catch((error) =>
        this.saveFailure(error).pipe(
          Effect.andThen(
            Effect.logWarning("google.calendar_sync_failed", {
              message: error.message,
              reconnect: error.reconnect,
            }),
          ),
        ),
      ),
      (work) => this.gate.withPermit(work),
    ),
  );
}
