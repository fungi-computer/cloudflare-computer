import assert from "node:assert/strict";
import { test } from "node:test";
import { probeComputerdHealth } from "../src/backends/container/health-probe.ts";

const options = { port: 8080, path: "/health", timeoutMs: 1_000 };
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("readiness consumes the daemon GET response before becoming healthy", async () => {
  let controller;
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(value) {
        controller = value;
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  const calls = [];
  const host = {
    async fetchPort(...args) {
      calls.push(args);
      return response;
    },
  };
  let healthy = false;
  const waiting = probeComputerdHealth(host, options).then(() => {
    healthy = true;
  });
  await flush();
  assert.equal(healthy, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 8080);
  assert.equal(calls[0][1], "http://container/health");
  assert.equal(calls[0][2].method, "GET");
  assert.ok(calls[0][2].signal instanceof AbortSignal);
  controller.enqueue(new TextEncoder().encode("ok\n"));
  await flush();
  assert.equal(healthy, false, "a partial response cannot establish readiness");
  controller.close();
  await waiting;
  assert.equal(healthy, true);
  assert.equal(cancelled, false);
  assert.equal(response.bodyUsed, true);
});

test("readiness refuses an unsuccessful daemon response", async () => {
  const response = new Response("not ready\n", { status: 503 });
  await assert.rejects(
    probeComputerdHealth({ fetchPort: async () => response }, options),
    /computerd health returned 503/u,
  );
  assert.equal(response.bodyUsed, true);
});

test("readiness refuses a successful status whose body cannot complete", async () => {
  const failure = new Error("health response interrupted");
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.error(failure);
      },
    }),
  );
  await assert.rejects(
    probeComputerdHealth({ fetchPort: async () => response }, options),
    (cause) => cause === failure,
  );
});

test("the existing deadline signal bounds the readiness request", async () => {
  let signal;
  const refused = assert.rejects(
    probeComputerdHealth(
      {
        fetchPort: async (_port, _url, init) => {
          signal = init.signal;
          return await new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          });
        },
      },
      { ...options, timeoutMs: 1 },
    ),
    (cause) => cause instanceof DOMException && cause.name === "TimeoutError",
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  await refused;
  assert.equal(signal.aborted, true);
});
