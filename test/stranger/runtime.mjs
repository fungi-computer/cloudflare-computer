import assert from "node:assert/strict";
import { parse } from "acorn";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import core from "@fungi.computer/cloudflare-computer/shell/core";
import jq from "@fungi.computer/cloudflare-computer/shell/jq";
import yq from "@fungi.computer/cloudflare-computer/shell/yq";
import xan from "@fungi.computer/cloudflare-computer/shell/xan";
import file from "@fungi.computer/cloudflare-computer/shell/file";

// Computer passes these published module groups to WorkerShellBackend. Verify
// their packed JavaScript with its maintained parser, without executing a shell
// or claiming that the Worker/Workspace/Git types are Node-compatible.
for (const group of [core, jq, yq, xan, file]) {
  assert.ok(Object.keys(group).length > 0);
  for (const [name, module] of Object.entries(group)) {
    assert.equal(typeof module.js, "string", name);
    assert.doesNotThrow(
      () => parse(module.js, { ecmaVersion: "latest", sourceType: "module" }),
      name,
    );
  }
}

// Check the installed tarball, including shared declaration chunks that are
// reachable through Workspace.provider(). Node binary globals must never be
// required by this public filesystem surface.
const dist = dirname(fileURLToPath(import.meta.resolve("@fungi.computer/cloudflare-computer")));
for (const entry of await readdir(dist, { recursive: true })) {
  if (!entry.endsWith(".d.ts")) continue;
  const declaration = await readFile(resolve(dist, entry), "utf8");
  assert.doesNotMatch(declaration, /\b(?:Buffer|BufferEncoding)\b/, entry);
}
console.log("PASS packed declarations require no Node binary globals");
