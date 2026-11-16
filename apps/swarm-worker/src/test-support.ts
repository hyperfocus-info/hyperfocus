import { Sandbox } from "railway";

export function fakeRailway() {
  const instances = new Map<string, ReturnType<typeof createSandbox>>();
  const operations: Array<{ name: string; id?: string; options?: unknown; command?: unknown }> = [];
  let next = 0;
  const versions = { node: "v24.22.0", bun: "1.4.3" };
  function createSandbox() {
    const id = `sandbox-${++next}`, files = new Map<string, Uint8Array>();
    const sandbox = {
      id, revision: "a".repeat(40), destroyed: false,
      exec(command: unknown, options: { signal?: AbortSignal; onStdout?: (text: string) => void; timeoutSec?: number } = {}) {
        operations.push({ name: "exec", id, command, options });
        const run = async () => {
          options.signal?.throwIfAborted();
          if (command === "wait") await new Promise<void>((_, reject) => options.signal?.addEventListener("abort", () => reject(options.signal!.reason), { once: true }));
          const stdout = command === "node --version && bun --version" ? `${versions.node}\n${versions.bun}\n` : command === "git rev-parse HEAD" ? sandbox.revision + "\n" : "remote output\n";
          options.onStdout?.(stdout);
          return { stdout, stderr: "", exitCode: command === "fail" ? 1 : 0, timedOut: command === "timeout", truncated: false };
        };
        const promise = run();
        return Object.assign(promise, { sessionName: Promise.resolve("durable-session") });
      },
      async fork(options: unknown) { operations.push({ name: "fork", id, options }); const child = createSandbox(); for (const [path, bytes] of files) await child.files.write(path, bytes); return child; },
      async destroy() { sandbox.destroyed = true; operations.push({ name: "destroy", id }); instances.delete(id); },
      async checkpoint(key: string) { operations.push({ name: "checkpoint", id, options: key }); },
      async heartbeat() { operations.push({ name: "heartbeat", id }); },
      files: {
        async write(path: string, bytes: Uint8Array) { files.set(path, new Uint8Array(bytes)); },
        async read(path: string) { return files.get(path) ?? new Uint8Array(); },
        async stat(path: string) { return { size: files.get(path)?.length ?? 0 }; },
      },
    };
    instances.set(id, sandbox);
    return sandbox;
  }
  const template = { withEnv(_env: Record<string, string>) { return template; }, withPackages(..._packages: string[]) { return template; }, run(_command: string) { return template; } };
  const methods = {
    template: () => template,
    async create(_template: unknown, options: unknown) { operations.push({ name: "create", options }); return createSandbox(); },
    async connect(id: string) { const sandbox = instances.get(id); if (!sandbox) { const error = new Error("Missing sandbox."); error.name = "SandboxNotFoundError"; throw error; } return sandbox; },
  };
  // Intercept the real SDK's external constructor surface; no prototype instance
  // or unchecked type assertion is needed for these deterministic boundary tests.
  const sdk = new Proxy(Sandbox, { get(target, property, receiver) {
    if (property === "template") return methods.template;
    if (property === "create") return methods.create;
    if (property === "connect") return methods.connect;
    return Reflect.get(target, property, receiver);
  } });
  return { sdk, instances, operations, versions };
}
