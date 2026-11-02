import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkspaceRuntime } from "../src/runtime/runtime.ts";

/** A runtime over one backend whose execution emits nothing until cancelled. */
function quietRuntime(cancelled) {
  const events = new ReadableStream({
    pull: () => new Promise(() => undefined),
    cancel: (reason) => {
      cancelled.push(reason);
    },
  });
  return new WorkspaceRuntime({
    callableBackendIds: new Set(),
    resolveBackendId: () => "quiet",
    backendHandle: () =>
      Promise.resolve({
        exec: () => Promise.resolve({ id: "exec_quiet", events }),
      }),
  });
}

test("cancelling a handle while a read is pending releases its reader once", async () => {
  const cancelled = [];
  const handle = await quietRuntime(cancelled).exec("sleep");
  const reader = handle.getReader();
  // The pending read keeps the handle's pull, and its source reader, open.
  const pending = reader.read();
  await new Promise((resolve) => setImmediate(resolve));
  // Cancelling settles that read first; the pull's done branch then clears
  // the shared reader while cancel still awaits the source.
  await reader.cancel("observer left");
  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.deepEqual(cancelled, ["observer left"]);
});
