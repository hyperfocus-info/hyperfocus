import { resolve } from "node:path";
import { createAuthoritativeServer, createMmo1000Preset } from "@hyperfocus/engine/server";
import { assertDistinctPorts, createStaticFileHandler, parseTcpPort } from "@hyperfocus/engine/tooling/server";
import { createMmoSkillDemoGame } from "./src/game.ts";
import { mmoSkillDemoInputCodec } from "./src/input-codec.ts";

const port = parseTcpPort(process.env.PORT, 8_791, "PORT");
const staticPort = parseTcpPort(process.env.STATIC_PORT, 8_792, "STATIC_PORT");
assertDistinctPorts(port, staticPort, "PORT", "STATIC_PORT");
const engineRoot = resolve(import.meta.dir, "..", "..");
const browserIsolationHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin"
};
const staticFiles = createStaticFileHandler({
  root: engineRoot,
  index: "examples/mmo-skill-demo/client.html",
  headers: browserIsolationHeaders,
  allow(path) {
    return path === "examples/mmo-skill-demo/client.html"
      || path === "examples/mmo-skill-demo/dist/client.js"
      || (path.startsWith("examples/mmo-skill-demo/assets/") && path.toLowerCase().endsWith(".png"));
  },
  cacheControl: (path) => path.startsWith("examples/mmo-skill-demo/assets/") ? "public, max-age=3600" : "no-store",
});

function replicationTelemetrySnapshot() {
  const stats = server.getStats();
  return {
    rooms: stats.roomTelemetry.map((room) => {
      const replication = room.room && typeof room.room === "object" ? Reflect.get(room.room, "replication") : undefined;
      return {
        id: room.id,
        type: room.type,
        players: room.players,
        warnings: room.warnings,
        replication: {
          currentTick: room.replication.currentTick,
          rollingAverage: room.replication.rollingAverage,
          pendingStaticCount: room.replication.pendingStaticCount,
          pendingStaticBytes: room.replication.pendingStaticBytes,
          maxBytesPerClientPerSecond: room.replication.maxBytesPerClientPerSecond
        },
        adaptive: room.adaptive,
        discovery: replication && typeof replication === "object" ? Reflect.get(replication, "discovery") : undefined
      };
    })
  };
}

async function staticResponse(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("method not allowed", { status: 405, headers: { ...browserIsolationHeaders, allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  if (url.pathname === "/healthz") return new Response(request.method === "HEAD" ? null : "ok", { headers: { ...browserIsolationHeaders, "cache-control": "no-store" } });
  if (url.pathname === "/stats.json") {
    return request.method === "HEAD"
      ? new Response(null, { headers: { ...browserIsolationHeaders, "cache-control": "no-store", "content-type": "application/json" } })
      : Response.json(server.getStats(), { headers: { ...browserIsolationHeaders, "cache-control": "no-store" } });
  }
  if (url.pathname === "/telemetry.json") {
    return request.method === "HEAD"
      ? new Response(null, { headers: { ...browserIsolationHeaders, "cache-control": "no-store", "content-type": "application/json" } })
      : Response.json(replicationTelemetrySnapshot(), { headers: { ...browserIsolationHeaders, "cache-control": "no-store" } });
  }
  return staticFiles(request);
}

const scale = createMmo1000Preset({
  publicRoomType: "mmo-skill-demo",
  publicRoomPrefix: "mmo-field",
  publicRooms: 10,
  admissionSelection: "fill-first"
});
const game = createMmoSkillDemoGame();

const server = createAuthoritativeServer({
  transport: "websocket",
  port,
  devMode: true,
  rooms: game.engineWorld.roomTypes(),
  inputCodec: mmoSkillDemoInputCodec,
  binaryInputPayloadOwnership: "borrow",
  scale
});

server.createRoom(game.instances.dungeon.roomType, game.instances.dungeon.roomId);
server.createRoom(game.instances.cottage.roomType, game.instances.cottage.roomId);
server.start();

const staticServer = Bun.serve({
  port: staticPort,
  fetch: staticResponse
});

console.info(`MMO Skill Demo authoritative zone listening on http://localhost:${port}`);
console.info(`MMO Skill Demo client listening on http://localhost:${staticServer.port}/examples/mmo-skill-demo/client.html`);
console.info(`Replication telemetry: http://localhost:${staticServer.port}/telemetry.json`);
console.info(`Dungeon instance URL: http://localhost:${staticServer.port}/examples/mmo-skill-demo/client.html?room=dungeon-party-1`);
console.info(`Cottage instance URL: http://localhost:${staticServer.port}/examples/mmo-skill-demo/client.html?room=cottage-demo`);
