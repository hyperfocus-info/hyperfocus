export function portReservationConflict(host: string, port: number) {
  return Object.assign(new Error(`Development port ${host}:${port} is already reserved.`), { code: "DEV_PORT_RESERVED" });
}

export function isPortReservationConflict(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "DEV_PORT_RESERVED";
}

/** Hold OS probes until the registry atomically owns every required endpoint.
 * Other managed starts must skip a reservation even before its child listens. */
export async function claimAvailableDevPort<T>({ startPort, offsets = [0], claim }: {
  startPort: number;
  offsets?: readonly number[];
  claim: (port: number, ports: readonly number[]) => T;
}) {
  if (!Number.isInteger(startPort) || !offsets.includes(0) || offsets.some(offset => !Number.isInteger(offset))
    || startPort + Math.min(...offsets) < 1 || startPort + Math.max(...offsets) > 65_535) {
    throw new RangeError("Development ports must be integers between 1 and 65535.");
  }
  const lastPort = Math.min(65_535 - Math.max(...offsets), startPort + 100);
  for (let port = startPort; port <= lastPort; port++) {
    const probes: ReturnType<typeof Bun.serve>[] = [];
    try {
      const ports = [...new Set(offsets.map(offset => port + offset))];
      for (const endpoint of ports) probes.push(Bun.serve({ hostname: "127.0.0.1", port: endpoint, fetch: () => new Response("probe") }));
      return claim(port, ports);
    } catch (error) {
      if (!isPortReservationConflict(error)
        && (!(error instanceof Error) || !("code" in error) || error.code !== "EADDRINUSE")) throw error;
    } finally {
      for (const probe of probes) await probe.stop(true);
    }
  }
  throw new Error(`No unreserved development port found from ${startPort} to ${lastPort}.`);
}
