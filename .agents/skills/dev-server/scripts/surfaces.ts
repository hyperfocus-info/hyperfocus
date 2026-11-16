import path from "node:path";

export type DevSurfaceName = "example-workspace" | "harness" | "editor" | "pad-pilot" | "synaesthetic" | "artifact-review" | "site-preview" | "books" | "trade-bot" | "album-library" | "combat-relay" | "touch-of-death-audio" | "touch-of-death-lab" | "touch-of-death-runs" | "pale-reach" | "pale-reach-review" | "game-art";

export type DevSurface = {
  name: DevSurfaceName;
  defaultPort: number;
  healthPath: string;
  portOffsets?: readonly number[];
  command(repositoryRoot: string): string[];
  environment(port: number): Record<string, string>;
};

const surfaces: Record<DevSurfaceName, DevSurface> = {
  synaesthetic: {
    name: "synaesthetic", defaultPort: 3217, healthPath: "/api/v1/library?limit=1",
    command: root => [process.execPath, path.join(root, "apps/pad-pilot/scripts/synaesthetic-evaluator/evaluation-cli.ts"), "serve"],
    environment: port => ({ PADPILOT_EVALUATOR_PORT: String(port), ...(process.env.PADPILOT_EVALUATOR_DB_PATH ? { PADPILOT_EVALUATOR_DB_PATH: path.resolve(process.env.PADPILOT_EVALUATOR_DB_PATH) } : {}) }),
  },
  'example-workspace': {
    name: 'example-workspace', defaultPort: 8820, healthPath: '/', portOffsets: [-1,0,1],
    command: root => [process.execPath, path.join(root, 'apps/engine-editor/example-workspace/runtime.ts')],
    environment: port => ({ PORT: String(port), HOST: '127.0.0.1' }),
  },
  'trade-bot': {
    name: 'trade-bot', defaultPort: 8813, healthPath: '/healthz',
    command: root => process.env.TRADE_ARTIFACT_DIR
      ? [process.execPath, '--cwd', path.resolve(process.env.TRADE_ARTIFACT_DIR), path.resolve(process.env.TRADE_ARTIFACT_DIR, 'server.js')]
      : [process.execPath, path.join(root, 'apps/engine-editor/website/examples/trade-bot/server.ts')],
    environment: port => ({ PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', TRADE_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, TRADE_OIDC_CLIENT_ID: '', TRADE_OIDC_CLIENT_SECRET: '' }),
  },
  books: {
    name: 'books', defaultPort: 8812, healthPath: '/healthz',
    command: root => process.env.BOOKS_ARTIFACT_DIR
      ? [process.execPath, '--cwd', path.resolve(process.env.BOOKS_ARTIFACT_DIR), path.resolve(process.env.BOOKS_ARTIFACT_DIR, 'server.js')]
      : [process.execPath, path.join(root, 'apps/engine-editor/website/examples/books/server.ts')],
    environment: port => ({ PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development', BOOKS_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, DATABASE_URL: '', BOOKS_REQUIRE_POSTGRES: '0', CLERK_PUBLISHABLE_KEY: '', CLERK_SECRET_KEY: '' }),
  },
  'album-library': {
    name: 'album-library', defaultPort: 8810, healthPath: '/healthz',
    command: () => {
      const entrypoint = process.env.ALBUM_LIBRARY_ENTRYPOINT;
      if (!entrypoint) throw new Error('album-library requires ALBUM_LIBRARY_ENTRYPOINT pointing to the local album-bundle server.');
      return [process.execPath, path.resolve(entrypoint)];
    },
    environment: port => ({ PORT: String(port), HOST: '127.0.0.1' }),
  },
  'touch-of-death-runs': {
    name: 'touch-of-death-runs', defaultPort: 8808, healthPath: '/healthz',
    command: root => [process.execPath, path.join(root, 'spikes/persistent-world-worker/lab/serve.ts')],
    environment: port => ({ PORT: String(port), PERF_NATIVE_SHARES_ONLY:'1', ...(process.env.PERF_LAB_ROOT ? { PERF_LAB_ROOT:path.resolve(process.env.PERF_LAB_ROOT) } : {}), ...(process.env.PERF_AUDIO_URL ? { PERF_AUDIO_URL:process.env.PERF_AUDIO_URL } : {}) }),
  },
  'touch-of-death-lab': {
    name: 'touch-of-death-lab', defaultPort: 8807, healthPath: '/healthz',
    command: root => [process.execPath, path.join(root, 'spikes/persistent-world-worker/lab/serve.ts')],
    environment: port => ({ PORT: String(port), ...(process.env.PERF_LAB_ROOT ? { PERF_LAB_ROOT: path.resolve(process.env.PERF_LAB_ROOT) } : {}), ...(process.env.PERF_AUDIO_URL ? { PERF_AUDIO_URL: process.env.PERF_AUDIO_URL } : {}) }),
  },
  'game-art': {
    name: 'game-art', defaultPort: 8806, healthPath: '/healthz',
    command: root => [process.execPath, path.join(root, 'apps/engine-editor/scripts/game-art/server.ts')],
    environment: port => ({ PORT: String(port) }),
  },
  'pale-reach-review': {
    name: 'pale-reach-review', defaultPort: 4320, healthPath: '/healthz',
    command: root => [process.execPath, path.join(root, 'scripts/artifact-review/server.ts')],
    environment: port => ({ ARTIFACT_REVIEW_PORT: String(port), ARTIFACT_REVIEW_HOST: '127.0.0.1', ARTIFACT_REVIEW_MANIFEST: path.resolve('.local/pale-reach/review/manifest.json') }),
  },
  'pale-reach': {
    name: 'pale-reach', defaultPort: 8805, healthPath: '/healthz',
    command: root => [process.execPath, path.join(root, 'apps/engine-editor/verification/pale-reach/server.ts')],
    environment: port => ({ PORT: String(port) }),
  },
  'touch-of-death-audio': {
    name: 'touch-of-death-audio', defaultPort: 8797, healthPath: '/healthz',
    command: () => {
      const directory = process.env.TOUCH_OF_DEATH_WEB_DIR;
      if (!directory) throw new Error('touch-of-death-audio requires TOUCH_OF_DEATH_WEB_DIR pointing to the packaged web artifact.');
      const artifact = path.resolve(directory);return [process.execPath, '--cwd', artifact, path.join(artifact, 'deploy.js')];
    },
    environment: port => ({ PORT: String(port), HOST: '0.0.0.0', ...(process.env.TOUCH_OF_DEATH_WEB_DIR ? { TOUCH_OF_DEATH_WEB_DIR: path.resolve(process.env.TOUCH_OF_DEATH_WEB_DIR) } : {}) }),
  },
  "combat-relay": {
    name: "combat-relay", defaultPort: 8801, healthPath: "/healthz",
    command: root => {
      const project = process.env.TOUCH_OF_DEATH_PROJECT_DIR;
      if (!project) throw new Error("combat-relay requires TOUCH_OF_DEATH_PROJECT_DIR pointing to an editor project.");
      const artifact = process.env.TOUCH_OF_DEATH_HOST_ARTIFACT;
      return artifact
        ? [process.execPath, '--cwd', path.dirname(path.resolve(artifact)), path.resolve(artifact), '--project', path.resolve(project)]
        : [process.execPath, path.join(root, "packages/engine/examples/touch-of-death/host/relay.ts"), "--project", path.resolve(project)];
    },
    environment: port => {
      const mode = process.env.TOUCH_OF_DEATH_STORAGE ?? 'sqlite';
      if (mode !== 'sqlite' && mode !== 'postgres') throw new Error('TOUCH_OF_DEATH_STORAGE must be sqlite or postgres.');
      return { PORT: String(port), HOST: "127.0.0.1", TOUCH_OF_DEATH_STORAGE: mode,
        TOUCH_OF_DEATH_REQUIRE_POSTGRES: mode === 'postgres' ? '1' : '0', ...(mode === 'sqlite' ? { DATABASE_URL: '' } : {}) };
    },
  },
  "site-preview": {
    name: "site-preview",
    defaultPort: 8800,
    healthPath: "/healthz",
    command: () => {
      const artifact = process.env.SITE_BUILDER_ARTIFACT_DIR;
      if (!artifact) throw new Error("site-preview requires SITE_BUILDER_ARTIFACT_DIR pointing to an extracted app.");
      return [process.execPath, path.join(path.resolve(artifact), "deploy.js")];
    },
    environment: (port) => ({ PORT: String(port), HOST: "127.0.0.1" })
  },
  "artifact-review": {
    name: "artifact-review",
    defaultPort: 4318,
    healthPath: "/healthz",
    command: (root) => [process.execPath, path.join(root, "scripts", "artifact-review", "server.ts")],
    environment: (port) => ({ ARTIFACT_REVIEW_PORT: String(port), ARTIFACT_REVIEW_HOST: "0.0.0.0" })
  },
  harness: {
    name: "harness",
    defaultPort: 8787,
    healthPath: "/",
    command: (root) => [process.execPath, path.join(root, "apps", "harness", "scripts", "dev", "start.ts")],
    environment: (port) => ({ HARNESS_PORT: String(port), NODE_ENV: "development" })
  },
  editor: {
    name: "editor",
    defaultPort: 8796,
    healthPath: "/healthz",
    command: (root) => {
      const artifact = process.env.ENGINE_EDITOR_ARTIFACT_DIR;
      return artifact ? [process.execPath, '--cwd', path.resolve(artifact), path.join(path.resolve(artifact), 'cli.js'), 'serve'] : [process.execPath, path.join(root, "apps", "engine-editor", "dev.ts")];
    },
    environment: (port) => ({ ENGINE_EDITOR_PORT: String(port), NODE_ENV: "development", ...(process.env.ENGINE_EDITOR_ARTIFACT_DIR ? { ENGINE_EDITOR_ARTIFACT_DIR: path.resolve(process.env.ENGINE_EDITOR_ARTIFACT_DIR), HYPERFOCUS_EDITOR_OUTPUT_ROOT: path.resolve(process.env.ENGINE_EDITOR_ARTIFACT_DIR) } : {}) })
  },
  "pad-pilot": {
    name: "pad-pilot",
    defaultPort: 3000,
    healthPath: "/api/dev/static-check",
    command: (root) => [process.execPath, path.join(root, "apps", "pad-pilot", "scripts", "dev.ts")],
    environment: (port) => ({
      NODE_ENV: "development",
      PADPILOT_MARKETPLACE_PORT: String(port),
      PADPILOT_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`
    })
  }
};

const aliases = new Map<string, DevSurfaceName>([
  ["synaesthetic", "synaesthetic"],
  ['example-workspace', 'example-workspace'],
  ['trade-bot', 'trade-bot'],
  ['books', 'books'],
  ['album-library', 'album-library'],
  ['game-art', 'game-art'],
  ['pale-reach-review', 'pale-reach-review'],
  ['pale-reach', 'pale-reach'],
  ['touch-of-death-audio', 'touch-of-death-audio'],
  ['touch-of-death-lab', 'touch-of-death-lab'],
  ['touch-of-death-runs', 'touch-of-death-runs'],
  ["combat-relay", "combat-relay"],
  ["site-preview", "site-preview"],
  ["artifact-review", "artifact-review"],
  ["harness", "harness"],
  ["editor", "editor"],
  ["engine-editor", "editor"],
  ["pad-pilot", "pad-pilot"],
  ["marketplace", "pad-pilot"],
  ["pad-pilot-marketplace", "pad-pilot"]
]);

export function resolveDevSurface(name: string) {
  const canonical = aliases.get(name.toLowerCase());
  return canonical ? surfaces[canonical] : undefined;
}

export function listDevSurfaces() {
  return Object.values(surfaces);
}
