// Assembles the Worker Loader modules table the shell runs from.
//
// build-bundle.mjs runs esbuild with splitting: true and
// partitions the emitted modules into a core group (every
// always-on command plus the ShellWorker entry) and one group per
// optional command, each published on its own
// @cloudflare/computer/shell/<feature> subpath.
//
// Selection is import-based, not flag-based: this module imports
// only the core group. A consumer opts a command in by passing a
// loader for its group module to WorkerBackend's `commands` option
// (or to assembleShellModules directly). Because nothing here
// references the optional groups, a group the consumer never
// loads is unreachable in their module graph and the bundler
// drops it — no build-time define, no explicit opt-out needed.
//
// Groups load when a shell Worker is minted, never at module
// evaluation: a group is megabytes of source strings, and a host
// bundle that evaluated them at start would hold them on its heap
// while idle.

// One generated feature group: module name -> source string. The
// core group and every @cloudflare/computer/shell/<feature> import
// share this shape.
export type ShellModuleGroup = Readonly<Record<string, { js: string }>>;

// Loads one optional group, for example
// `() => import("@cloudflare/computer/shell/jq").then((m) => m.default)`.
export type ShellModuleGroupLoader = () => Promise<ShellModuleGroup>;

// Merge the always-on core group with the optional groups the
// consumer passed. Later groups win on key collisions, but the
// build keeps groups disjoint so order never matters in practice.
export async function assembleShellModules(
  groups: readonly ShellModuleGroupLoader[] = [],
): Promise<Readonly<Record<string, { js: string }>>> {
  // Fork: the package self-reference follows its published name.
  const { default: coreModules } = await import("@fungi.computer/cloudflare-computer/shell/core");
  const modules: Record<string, { js: string }> = { ...coreModules };
  for (const load of groups) {
    Object.assign(modules, await load());
  }
  return Object.freeze(modules);
}
