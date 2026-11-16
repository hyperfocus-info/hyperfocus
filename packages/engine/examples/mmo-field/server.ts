import { createAuthoritativeServer } from "@hyperfocus/engine/server";
import { createStaticFileHandler, parseTcpPort } from "@hyperfocus/engine/tooling/server";
import { fieldRoom } from "./src/shared.ts";

const port = parseTcpPort(process.env.PORT, 8_788, "PORT");
const staticFiles = createStaticFileHandler({
  root: import.meta.dir,
  index: "client.html",
  allow: (path) => path === "client.html" || path === "dist/client.js" || /^brand\/[a-z0-9-]+\.(svg|png|ico|json|webmanifest)$/.test(path),
});
const server = createAuthoritativeServer({
  transport: "websocket",
  hostname: process.env.HOST?.trim() || "127.0.0.1",
  port,
  devMode: true,
  rooms: [fieldRoom],
  tickRate: 20,
  httpHandler: staticFiles,
});

server.createRoom("field", "field");
server.start();

console.info(`MMO Field listening on http://localhost:${port}/`);
