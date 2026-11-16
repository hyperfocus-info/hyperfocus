import { aiRunRequestSchema, type AiRunResult } from "@hyperfocus/ai-core/runtime";
import { protobufContentType, protobufResponse, readProtobufBody } from "@hyperfocus/serialization/http";
import { z } from "zod";
import { createLocalAiRuntime, type LocalAiRuntime } from "./runtime";
import { catalogQuerySchema } from "./catalog";
import { createSharedAiPreferencesStore, type SharedAiPreferencesStore } from "./preferences/store";

const credentialRequestSchema = z
  .object({ providerId: z.string().min(1).max(160), apiKey: z.string().min(1).max(32_000) })
  .strict();

export function createAiRuntimeHttpHandler(
  runtime: LocalAiRuntime = createLocalAiRuntime(),
  options: { pathPrefix?: string; preferencesStore?: SharedAiPreferencesStore; qualityProject?: string; onRunResult?: (result: AiRunResult) => void | Promise<void> } = {}
) {
  const prefix = options.pathPrefix ?? "/api/ai/v1";
  const preferencesStore = options.preferencesStore ?? createSharedAiPreferencesStore();
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${prefix}/`) && url.pathname !== prefix) return undefined;
    const binary = request.headers.get("accept") === protobufContentType || request.headers.get("content-type") === protobufContentType;
    const respond = (value: unknown, status = 200) => response(value, status, binary);

    try {
      if (request.method === "GET" && url.pathname === `${prefix}/preferences`) {
        return respond(preferencesStore.read());
      }
      if (request.method === "PUT" && url.pathname === `${prefix}/preferences`) {
        return respond(preferencesStore.write(await readProtobufBody(request, { maxBytes: 2097152 })));
      }
      if (request.method === "GET" && url.pathname === `${prefix}/catalog`) {
        const query = Object.fromEntries(url.searchParams);
        const available = query.availableOnly;
        const parsed = catalogQuerySchema.parse({ ...query,
          ...(available === undefined ? {} : { availableOnly: available === "true" ? true : available === "false" ? false : available }) });
        return respond({ ...(await runtime.catalog(parsed, { signal: request.signal })), credentialPersistence: runtime.credentialPersistence() });
      }
      if (request.method === "POST" && url.pathname === `${prefix}/run`) {
        const result = await runtime.run(aiRunRequestSchema.parse(await readProtobufBody(request, { maxBytes: 2097152 })), { signal: request.signal, qualityProject: options.qualityProject });
        await options.onRunResult?.(result);
        return respond(result);
      }
      if (request.method === "PUT" && url.pathname === `${prefix}/credentials`) {
        const input = credentialRequestSchema.parse(await readProtobufBody(request, { maxBytes: 65536 }));
        await runtime.setCredential(input.providerId, input.apiKey);
        return respond({ ok: true, providerId: input.providerId });
      }
      if (request.method === "DELETE" && url.pathname.startsWith(`${prefix}/credentials/`)) {
        const providerId = decodeURIComponent(url.pathname.slice(`${prefix}/credentials/`.length));
        await runtime.deleteCredential(providerId);
        return respond({ ok: true, providerId });
      }
      return respond({ error: "Not found." }, 404);
    } catch (error) {
      return respond({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  };
}

function response(value: unknown, status: number, binary: boolean): Response {
  return (binary ? protobufResponse : Response.json)(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
