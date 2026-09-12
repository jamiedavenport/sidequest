import type { Page } from "@playwright/test";

// Model a browser-held access handle whose advisory Web Lock has already gone away.
export async function holdTemporaryOpfsFile(page: Page) {
  await page.evaluate(async () => {
    const script = `
      let handle;
      (async () => {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle('.ahp-sidequest-regression', { create: true });
        const file = await directory.getFileHandle('0.tmp', { create: true });
        handle = await file.createSyncAccessHandle();
        handle.write(new TextEncoder().encode('retained'));
        handle.flush();
        postMessage('ready');
      })().catch(error => postMessage({ error: error.message }));
      onmessage = () => {
        const contents = new Uint8Array(handle.getSize());
        handle.read(contents, { at: 0 });
        postMessage(new TextDecoder().decode(contents));
      };
    `;
    const url = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
    const worker = new Worker(url);
    await new Promise<void>((resolve, reject) => {
      worker.addEventListener(
        "message",
        ({ data }) => {
          if (data === "ready") {
            resolve();
          } else {
            reject(new Error(data.error));
          }
        },
        { once: true },
      );
      worker.addEventListener(
        "error",
        () => reject(new Error("Could not hold the temporary file")),
        { once: true },
      );
    });
    URL.revokeObjectURL(url);
    Reflect.set(window, "lockedTemporaryWorker", worker);
  });
}

export async function readTemporaryOpfsFile(page: Page) {
  return page.evaluate(() => {
    const worker: Worker = Reflect.get(window, "lockedTemporaryWorker");
    return new Promise<string>((resolve) => {
      worker.addEventListener("message", ({ data }) => resolve(data), { once: true });
      // Workers do not accept a targetOrigin.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage("read");
    });
  });
}
