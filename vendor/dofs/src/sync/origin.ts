import type { Database } from "../storage.js";
import type { ChangeEntry } from "./changes.js";
import { pathsOf } from "./paths.js";
import { DEFAULT_BACKEND_ID } from "./watermarks.js";

// Upstream origin: which backend produced a path's current state.
//
// A pull applies a backend's change and bumps the local rev, so the
// next push to that same backend coalesces the path again. Shipping
// it back is an echo of a state the backend already had, and it is
// harmful: the backend may have written the path again since it was
// pulled (a running process appending to a log), and applying the
// echo would replace that newer write with the older pulled copy.
//
// Each upstream apply therefore records, per backend, the rev it
// stamped on every path it touched. A push to that backend skips a
// path whose live rev is still that rev: nothing changed it locally
// after the backend produced it. A later local write, or another
// backend's apply, stamps a newer rev and the path ships as usual.
//
// The record is only valid while the backend keeps the state it
// produced. When the sync driver learns the backend lost its store
// (its watermarks fell behind ours) it forgets that backend's
// origins, so the rebuilding push ships every path again.

/**
 * Record the rev of every path an upstream apply touched after `sinceRev`.
 * The caller runs the apply and this record with no await between them, so
 * every rev above `sinceRev` came from that apply.
 */
export function recordUpstreamOrigin(
  db: Database,
  sinceRev: number,
  backend: string = DEFAULT_BACKEND_ID,
): void {
  const revs = new Map<string, number>();
  const keep = (path: string, rev: number) => {
    if (rev > (revs.get(path) ?? 0)) revs.set(path, rev);
  };
  for (const { inode, rev } of db.all<{ inode: number; rev: number }>(
    "SELECT inode, rev FROM vfs_nodes WHERE rev > ?",
    sinceRev,
  )) {
    for (const path of pathsOf(db, inode)) keep(path, rev);
  }
  for (const { path, rev } of db.all<{ path: string; rev: number }>(
    "SELECT path, MAX(rev) AS rev FROM vfs_changes WHERE rev > ? AND op = 'delete' GROUP BY path",
    sinceRev,
  )) {
    keep(path, rev);
  }
  for (const [path, rev] of revs) {
    db.run(
      "INSERT INTO _vfs_upstream_origin (backend, path, rev) VALUES (?, ?, ?) " +
        "ON CONFLICT(backend, path) DO UPDATE SET rev = excluded.rev",
      backend,
      path,
      rev,
    );
  }
}

/** Whether `entry` is the state `backend` itself produced, unchanged since. */
export function isUpstreamEcho(
  db: Database,
  entry: ChangeEntry,
  backend: string = DEFAULT_BACKEND_ID,
): boolean {
  return (
    db.scalar<number>(
      "SELECT rev FROM _vfs_upstream_origin WHERE backend = ? AND path = ?",
      backend,
      entry.path,
    ) === entry.rev
  );
}

/** Forget what `backend` produced once it is known to have lost that state. */
export function forgetUpstreamOrigin(db: Database, backend: string = DEFAULT_BACKEND_ID): void {
  db.run("DELETE FROM _vfs_upstream_origin WHERE backend = ?", backend);
}
