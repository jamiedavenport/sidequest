import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = process.cwd();

const expectedPersistencePath = resolve(projectRoot, ".playwright/e2e-state");

const persistencePath = resolve(process.env.E2E_PERSISTENCE_PATH ?? expectedPersistencePath);

if (persistencePath !== expectedPersistencePath) {
  throw new Error(`Refusing to use unexpected E2E persistence path: ${persistencePath}`);
}

await rm(persistencePath, { force: true, recursive: true });

const migration = Bun.spawn(
  [
    "bunx",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "sidequest-e2e-db",
    "--local",
    "--persist-to",
    persistencePath,
    "--config",
    "e2e/wrangler.jsonc",
  ],
  {
    cwd: projectRoot,
    stderr: "inherit",
    stdout: "inherit",
  },
);

const migrationExitCode = await migration.exited;

if (migrationExitCode !== 0) {
  await rm(persistencePath, { force: true, recursive: true });
  throw new Error(`E2E migrations failed with exit code ${migrationExitCode}`);
}

const server = Bun.spawn(
  ["bunx", "vite", "dev", "--mode", "e2e", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      E2E_PERSISTENCE_PATH: persistencePath,
    },
    stderr: "inherit",
    stdout: "inherit",
  },
);

let stopping = false;

let cleanupPromise: Promise<void> | undefined;

function cleanup(): Promise<void> {
  cleanupPromise ??= rm(persistencePath, { force: true, recursive: true });
  return cleanupPromise;
}

async function stop(signal: NodeJS.Signals): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  server.kill(signal);
  await server.exited;
  await cleanup();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stop(signal);
  });
}

const serverExitCode = await server.exited;

await cleanup();
process.exitCode = serverExitCode;
