// Startup readiness over the daemon's existing GET health endpoint.
// ctx.container.running means the runtime is attached, not that computerd
// is listening. Callers own retries and backoff; this helper makes one probe.
//
// Consume the response before reusing its port: an empty first response
// breaks pooled local container tunnels (cloudflare/workerd#7597).

import type { IWorkspaceContainerAPI } from "./container-host.js";

export interface ComputerdHealthProbeOptions {
  // TCP port computerd listens on inside the container.
  port: number;
  // Path to probe. Defaults to /health at the call site; required
  // here so both callers thread the same value.
  path: string;
  // Per-probe timeout. The helper aborts the request when it
  // elapses; the host's fetchPort surfaces that as a rejection.
  timeoutMs: number;
}

export async function probeComputerdHealth(
  host: IWorkspaceContainerAPI,
  options: ComputerdHealthProbeOptions,
): Promise<void> {
  const signal = AbortSignal.timeout(options.timeoutMs);
  const res = await host.fetchPort(options.port, `http://container${options.path}`, {
    method: "GET",
    signal,
  });
  // Await EOF before startup sends /connect on this pooled port.
  await res.arrayBuffer();
  if (!res.ok) {
    throw new Error(`computerd health returned ${res.status}`);
  }
}
