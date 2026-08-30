# Temporary data storage and sync plan

> Status: proposed architecture, ready for a proof of concept. Delete this file
> after the plan has been implemented or replaced by permanent documentation.

## Decision

Use a Cloudflare-native, workspace-scoped architecture:

- **D1 + Drizzle:** Better Auth and the global control plane: users, workspaces,
  and workspace memberships.
- **One `WorkspaceDO` per workspace:** authoritative application data and live
  connections.
- **TanStack DB inside the Durable Object:** `lanes` and `tasks` collections,
  persisted to the DO's SQLite storage with
  `@tanstack/cloudflare-durable-objects-db-sqlite-persistence`.
- **TanStack DB in the browser:** matching collections persisted to OPFS SQLite
  with `@tanstack/browser-db-sqlite-persistence`.
- **Offline mutations:** `@tanstack/offline-transactions` provides the durable
  browser outbox, idempotency keys, retries, and multi-tab leadership.
- **Custom thin sync transport:** one WebSocket per open workspace carries
  snapshots and committed changes. HTTP submits durable mutation batches.
- **R2 later:** attachments and other blobs.

The TanStack Durable Object package is a persistence adapter. It does **not**
provide browser-to-DO synchronization, authentication, authorization, or a
public application protocol. We must implement those parts.

```text
Browser
  TanStack DB collections
  + OPFS SQLite persistence
  + offline transaction outbox
            |
            | HTTPS commands + WebSocket changes
            v
Cloudflare Worker / TanStack Start
  Better Auth session + D1 membership check
            |
            | trusted principal + validated request
            v
WorkspaceDO (one instance per workspace)
  TanStack DB collections
  + DO SQLite persistence
  + command validation
  + WebSocket broadcast
```

## Data ownership

| Data                       | Authoritative store | Browser copy                          |
| -------------------------- | ------------------- | ------------------------------------- |
| Better Auth tables         | D1 via Drizzle      | Session state only                    |
| Workspaces and memberships | D1 via Drizzle      | Fetched/cached                        |
| Lanes and tasks            | Workspace DO SQLite | TanStack DB + OPFS SQLite             |
| Pending offline mutations  | Browser outbox      | IndexedDB, with localStorage fallback |
| Attachments                | R2                  | Normal browser cache                  |

There is no cross-database transaction between D1 and a Durable Object.
Workspace creation must therefore be idempotent: create the D1 workspace and
membership first, then initialize its DO on first use.

## Collections

Start with two normalized collections:

- `lanes`: workspace lane metadata and ordering.
- `tasks`: tasks containing `laneId` and optional `parentTaskId` references.

Do not persist the current nested `Lane.tasks` shape. UI hierarchy should be a
TanStack DB query/projection over normalized rows. Add collections such as
`projects`, `labels`, and `comments` only when their features are implemented.

Use client-generated IDs so records can be created while offline. Use an opaque,
lexicographically sortable `sortKey` for ordering; the DO validates or corrects
it when applying a move command.

## Shared schemas and collection definitions

Share domain invariants between the UI and DO. Do not share one finalized
options object, because persistence, synchronization, authorization, and
mutation handling differ by runtime.

```ts
// src/data/shared/task.ts
import { Schema } from "effect";

export class Task extends Schema.Class<Task>("sidequest/data/Task")({
  id: Schema.String,
  userId: Schema.String,
  laneId: Schema.String,
  parentTaskId: Schema.NullOr(Schema.String),
  title: Schema.NonEmptyString,
  sortKey: Schema.String,
  completedAt: Schema.NullOr(Schema.String),
  version: Schema.Int,
  updatedAt: Schema.String,
}) {}

export const taskCollectionDefinition = {
  id: "tasks",
  schema: Schema.toStandardSchemaV1(Task),
  getKey: (task: Task) => task.id,
} as const;

export const TASK_PROTOCOL_VERSION = 1;
export const TASK_BROWSER_STORAGE_VERSION = 1;
export const TASK_DO_STORAGE_VERSION = 1;
```

Define `Lane` and its collection in the same way.

Keep these versions separate:

- **Protocol version:** shape of network commands and changes.
- **Browser storage version:** a change can clear the synchronized local copy
  and repopulate it from the DO.
- **DO storage version:** canonical data cannot be cleared; it requires an
  explicit migration.

## Browser setup

Use OPFS SQLite with multi-tab coordination. Create one persistence instance for
all browser collections.

```ts
import { createCollection } from "@tanstack/db";
import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
  persistedCollectionOptions,
} from "@tanstack/browser-db-sqlite-persistence";
import { TASK_BROWSER_STORAGE_VERSION, taskCollectionDefinition } from "~/data/shared/task";

const database = await openBrowserWASQLiteOPFSDatabase({
  databaseName: "sidequest.sqlite",
});

const coordinator = new BrowserCollectionCoordinator({
  dbName: "sidequest",
});

const persistence = createBrowserWASQLitePersistence({
  database,
  coordinator,
});

export function createTasksCollection(syncClient: WorkspaceSyncClient) {
  return createCollection(
    persistedCollectionOptions({
      ...taskCollectionDefinition,
      schemaVersion: TASK_BROWSER_STORAGE_VERSION,
      persistence,
      sync: createWorkspaceCollectionSync({
        collectionId: taskCollectionDefinition.id,
        syncClient,
      }),
    }),
  );
}
```

`createWorkspaceCollectionSync` is application code. It adapts WebSocket
messages to TanStack DB's `begin`, `write`, and `commit` sync callbacks. A
single `WorkspaceSyncClient` must multiplex all collections over one WebSocket;
do not open one socket per collection.

Render immediately from persisted browser state. Connection and reconciliation
happen in the background.

## Offline writes

All user writes go through explicit offline transactions. The executor persists
the mutation before dispatch, applies the optimistic change locally, and retries
when connectivity returns.

```ts
import { startOfflineExecutor } from "@tanstack/offline-transactions";

const offline = startOfflineExecutor({
  collections: {
    lanes: lanesCollection,
    tasks: tasksCollection,
  },
  mutationFns: {
    submitWorkspaceCommands: async ({ transaction, idempotencyKey }) => {
      const commands = mutationsToCommands(transaction.mutations);
      const acknowledgement = await submitWorkspaceCommands({
        workspaceId,
        idempotencyKey,
        commands,
      });

      // Keep optimistic state until the authoritative change has been applied.
      await syncClient.awaitSequence(acknowledgement.sequence);
    },
  },
});

export async function createTask(input: NewTask) {
  const transaction = offline.createOfflineTransaction({
    mutationFnName: "submitWorkspaceCommands",
    autoCommit: false,
  });

  transaction.mutate(() => tasksCollection.insert(input));
  await transaction.commit();
}
```

Do not post blind CRUD patches for important operations. Convert local mutations
into semantic commands such as `task.create`, `task.rename`, `task.move`, and
`task.complete` so the DO can enforce invariants.

## Durable Object setup

Use one shared DO persistence instance for all collections in that workspace.

```ts
import { createCollection } from "@tanstack/db";
import {
  createCloudflareDOSQLitePersistence,
  persistedCollectionOptions,
} from "@tanstack/cloudflare-durable-objects-db-sqlite-persistence";
import { TASK_DO_STORAGE_VERSION, taskCollectionDefinition } from "~/data/shared/task";

export class WorkspaceDO extends DurableObject<Env> {
  private readonly persistence = createCloudflareDOSQLitePersistence({
    storage: this.ctx.storage,
  });

  private readonly tasks = createCollection(
    persistedCollectionOptions({
      ...taskCollectionDefinition,
      schemaVersion: TASK_DO_STORAGE_VERSION,
      persistence: this.persistence,
    }),
  );

  // Define lanes with the same persistence instance.
}
```

The DO is authoritative for one workspace. It must:

1. Accept only a trusted principal forwarded by the Worker.
2. Decode and validate every command with Effect Schema.
3. Deduplicate the batch by `idempotencyKey`.
4. Check membership role, record versions, and domain invariants.
5. Apply all accepted collection changes transactionally.
6. Increment a workspace-wide sequence and persist a replayable change batch.
7. Return `{ sequence, changes }` and broadcast the same batch to sockets.
8. Serve a snapshot when a client's cursor is missing or too old.

The adapter's internal tables and replay bookkeeping are implementation details.
Do not query them directly and do not use them as the application's public sync
log.

## Network protocol

Define the HTTP and WebSocket payloads with shared Effect Schemas. Decode at
every network boundary.

```ts
import { Schema } from "effect";

const TaskCreate = Schema.Struct({
  type: Schema.Literals(["task.create"]),
  task: Task,
});

const TaskMove = Schema.Struct({
  type: Schema.Literals(["task.move"]),
  taskId: Schema.String,
  laneId: Schema.String,
  sortKey: Schema.String,
  expectedVersion: Schema.Int,
});

export const WorkspaceCommand = Schema.Union([TaskCreate, TaskMove]);

export const CommandBatch = Schema.Struct({
  protocolVersion: Schema.Int,
  idempotencyKey: Schema.String,
  commands: Schema.Array(WorkspaceCommand),
});
```

Add the remaining command and change variants as features are implemented.

### HTTP routes / server functions

Implement only these initial application boundaries:

| Boundary                            | Purpose                                 |
| ----------------------------------- | --------------------------------------- |
| `GET/POST /api/auth/*`              | Better Auth catch-all                   |
| `GET /api/workspaces`               | List memberships/workspaces from D1     |
| `POST /api/workspaces`              | Create a workspace and owner membership |
| `POST /api/workspaces/:id/commands` | Submit one idempotent command batch     |
| `GET /api/workspaces/:id/sync`      | Upgrade to the workspace WebSocket      |

The corresponding client helpers are:

```ts
listWorkspaces();
createWorkspace(input);
submitWorkspaceCommands(batch);
openWorkspaceSync({ workspaceId, afterSequence });
```

A WebSocket upgrade is a route handler, not a conventional request/response
server function.

The Worker performs Better Auth session validation and the D1 membership check,
then forwards a trusted principal to:

```ts
const workspace = env.WORKSPACES.getByName(workspaceId);

await workspace.applyCommands(principal, batch);
await workspace.connectSync(principal, afterSequence, request);
```

Do not let clients choose or forge the forwarded principal.

## Sync behaviour

### Startup and reconnect

1. Hydrate collections immediately from browser OPFS.
2. Open the workspace WebSocket with the last applied sequence.
3. The DO sends ordered changes after that sequence, or a full snapshot if the
   cursor is too old.
4. Apply the snapshot/change batch through the collection sync adapter.
5. Drain the durable offline outbox in FIFO order.

### Successful mutation

1. Persist the offline transaction.
2. Apply the optimistic collection change.
3. POST semantic commands with the outbox idempotency key.
4. The DO validates, persists, increments the sequence, and broadcasts.
5. The HTTP response returns the same sequence and authoritative changes.
6. The browser waits until that sequence is applied before dropping optimistic
   state. Duplicate WebSocket delivery is ignored by sequence.

### Conflict

- The DO serializes all writes for the workspace.
- Commands carry `expectedVersion` where stale writes matter.
- On conflict, return a non-retriable 409 response plus authoritative rows.
- The browser applies those rows and reports the rejected action to the user.
- Network and 5xx failures retry; validation, authorization, and conflict errors
  do not retry forever.

## Cloudflare configuration shape

Add D1 and the SQLite-backed Durable Object to `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "sidequest",
      "database_id": "<created-by-wrangler>",
    },
  ],
  "durable_objects": {
    "bindings": [{ "name": "WORKSPACES", "class_name": "WorkspaceDO" }],
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["WorkspaceDO"] }],
}
```

Generate Cloudflare bindings after changing this file with `bun run cf-typegen`.

## Required proof of concept before full implementation

The persistence feature is still described by TanStack as an initial alpha.
Complete a narrow spike before committing the whole application:

1. Persist and query `tasks` and `lanes` in a SQLite-backed DO.
2. Verify an explicit multi-collection command and its sync-log entry are
   committed atomically. If the public TanStack APIs cannot guarantee this,
   switch only the DO internals to normalized Drizzle tables.
3. Create and edit tasks offline, reload the browser, then reconnect without
   losing or duplicating writes.
4. Test duplicate POSTs and duplicate WebSocket messages.
5. Test a stale cursor falling back to a snapshot.
6. Test two browser tabs using the shared OPFS database and offline outbox.
7. Test DO hibernation and reconstruction with active WebSockets.
8. Prove a supported canonical-data migration without reading TanStack's
   internal persistence tables. If this is not maintainable, use Drizzle inside
   the DO while retaining the same browser collections and network protocol.

The fallback does not change UI code or the public protocol:

- Keep TanStack DB + OPFS + offline transactions in the browser.
- Keep D1 + Drizzle for Better Auth and workspace membership.
- Replace only the DO collection persistence with normalized Drizzle SQLite
  tables and an explicit change log.

## Implementation order

1. Run the proof of concept and decide TanStack persistence versus Drizzle
   inside the DO.
2. Add shared Effect domain, command, change, and protocol schemas.
3. Add D1, DO bindings, migrations, and generated Cloudflare types.
4. Implement `WorkspaceDO`, snapshots, change sequencing, and WebSockets.
5. Implement browser OPFS collections and the shared workspace sync client.
6. Add the offline transaction executor and semantic task/lane commands.
7. Replace the current nested XState board data with live TanStack DB queries;
   keep XState only for interaction state if it remains useful.
8. Add Better Auth and enforce membership at every Worker boundary.
9. Add integration tests for offline/reload/reconnect/conflict behaviour.

## Current non-goals

- Cross-workspace relational queries inside workspace DOs.
- A separate sync SaaS or Postgres database.
- Direct client access to a Durable Object.
- Exposing TanStack persistence internals as an API.
- Perfect collaborative text editing or CRDTs.

## Primary references

- [TanStack DB 0.6 persistence and offline announcement](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)
- [TanStack browser SQLite persistence](https://github.com/TanStack/db/tree/main/packages/browser-db-sqlite-persistence)
- [TanStack Cloudflare DO SQLite persistence](https://github.com/TanStack/db/tree/main/packages/cloudflare-durable-objects-db-sqlite-persistence)
- [TanStack offline transactions](https://github.com/TanStack/db/tree/main/packages/offline-transactions)
- [Cloudflare Durable Object SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Cloudflare Durable Object WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Drizzle with Cloudflare Durable Objects](https://orm.drizzle.team/docs/connect-cloudflare-do)
- [Better Auth database documentation](https://www.better-auth.com/docs/concepts/database)
