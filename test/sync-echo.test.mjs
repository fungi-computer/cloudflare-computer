import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Database,
  initializeSchema,
  SQLiteWorkspaceProvider,
} from "../vendor/dofs/src/index.ts";
import { SQLiteTestStorage } from "../vendor/dofs/src/testing.ts";
import { createSyncServer } from "../vendor/rpc/src/server.ts";
import {
  pullOnce,
  pushOnce,
  reconcileWatermarks,
} from "../vendor/rpc/src/sync-driver.ts";

/** One SQLite-backed store, served the way computerd serves its own. */
function peer() {
  const storage = new SQLiteTestStorage();
  const db = new Database(storage);
  initializeSchema(db, () => 1000);
  return {
    db,
    rpc: createSyncServer(db),
    fs: new SQLiteWorkspaceProvider(db, { now: () => 1 }),
  };
}

const text = (fs, path) => new TextDecoder().decode(fs.readFileSync(path));

test("a host push never returns a pulled file over the backend's newer write", async () => {
  const host = peer();
  const container = peer();
  container.fs.writeFileSync("/log", "1\n");
  await pullOnce(host.db, container.rpc, "container");
  assert.equal(text(host.fs, "/log"), "1\n");
  // The container appends after the host pulled; the host's next command
  // bracket pushes before it pulls again.
  container.fs.writeFileSync("/log", "1\n2\n");
  await pushOnce(host.db, container.rpc, "container");
  assert.equal(text(container.fs, "/log"), "1\n2\n");
  await pullOnce(host.db, container.rpc, "container");
  assert.equal(text(host.fs, "/log"), "1\n2\n");
});

test("a host write after the pull still reaches the backend", async () => {
  const host = peer();
  const container = peer();
  container.fs.writeFileSync("/log", "1\n");
  await pullOnce(host.db, container.rpc, "container");
  host.fs.writeFileSync("/log", "host\n");
  await pushOnce(host.db, container.rpc, "container");
  assert.equal(text(container.fs, "/log"), "host\n");
});

test("a file pulled from one backend still reaches another", async () => {
  const host = peer();
  const first = peer();
  const second = peer();
  first.fs.writeFileSync("/log", "1\n");
  await pullOnce(host.db, first.rpc, "first");
  await pushOnce(host.db, second.rpc, "second");
  assert.equal(text(second.fs, "/log"), "1\n");
});

test("a backend that lost its store is rebuilt with the files it produced", async () => {
  const host = peer();
  const container = peer();
  container.fs.writeFileSync("/log", "1\n");
  await pullOnce(host.db, container.rpc, "container");
  host.fs.writeFileSync("/other", "x");
  await pushOnce(host.db, container.rpc, "container");
  // computerd restarts with an empty process-lifetime store.
  const restarted = peer();
  await reconcileWatermarks(host.db, restarted.rpc, "container");
  await pushOnce(host.db, restarted.rpc, "container");
  assert.equal(text(restarted.fs, "/log"), "1\n");
  assert.equal(text(restarted.fs, "/other"), "x");
});

test("an echo-only push still lets a restarted backend be detected and rebuilt", async () => {
  const host = peer();
  const container = peer();
  container.fs.writeFileSync("/log", "1\n");
  await pullOnce(host.db, container.rpc, "container");
  await pushOnce(host.db, container.rpc, "container");
  await pullOnce(host.db, container.rpc, "container");
  const restarted = peer();
  const reset = await reconcileWatermarks(host.db, restarted.rpc, "container");
  assert.equal(reset.pushRevReset, true);
  await pushOnce(host.db, restarted.rpc, "container");
  assert.equal(text(restarted.fs, "/log"), "1\n");
});
