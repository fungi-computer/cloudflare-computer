import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the packed shared JavaScript and declarations have stable filenames", () => {
  const [{ files }] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: packageDirectory,
      encoding: "utf8",
    }),
  );
  const paths = files.map(({ path }) => path);
  for (const extension of [".js", ".js.map", ".d.ts"]) {
    assert.ok(
      paths.some(
        (path) => path.startsWith("dist/shared-") && path.endsWith(extension),
      ),
      `packed shared ${extension} is present`,
    );
  }
  assert.deepEqual(
    paths.filter((path) =>
      /^dist\/shared-[A-Za-z0-9_-]{8}\.(?:js|js\.map|d\.ts)$/.test(path),
    ),
    [],
    "packed shared chunks must not carry content-derived hashes",
  );
});
