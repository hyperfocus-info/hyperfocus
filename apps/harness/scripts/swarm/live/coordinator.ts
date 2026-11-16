import { createSwarmService } from "../../../cli/src/swarm/service";

if (process.argv.slice(2).join(" ") !== "--allow-launch") throw Error("The local coordinator requires --allow-launch.");
if (process.env.SWARM_COORDINATOR_TOPOLOGY !== "laptop" || process.env.RAILWAY_PROJECT_ID) throw Error("This entrypoint requires explicit laptop coordination.");
const service = await createSwarmService();
await service.coordinator.startLoop();
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 255, maxRequestBodySize: 269484032, fetch: service.handler });
console.log(JSON.stringify({ type: "ready", url: `http://127.0.0.1:${server.port}` }));
let stopping: Promise<void> | undefined;
const stop = () => stopping ??= (async () => {
  clearInterval(expiry);
  await service.close(); await server.stop(true); process.stdin.destroy();
})();
const expiry = setInterval(() => { if (Date.now() >= Date.parse(process.env.SWARM_DEMONSTRATION_EXPIRES_AT ?? "")) void stop(); }, 1000);
process.stdin.resume();
process.stdin.once("end", () => { void stop(); });
process.once("SIGINT", () => { void stop(); });
process.once("SIGTERM", () => { void stop(); });
