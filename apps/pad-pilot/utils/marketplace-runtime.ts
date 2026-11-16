import { z } from "zod";

type WebBuildEnv = {
  version: number;
  MARKETPLACE_URL: string
};

const marketplaceUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
});

const webBuildEnvSchema = z.object({
  MARKETPLACE_URL: marketplaceUrl,
  version: z.number().int().positive(),
});

function resolveWebBuildEnv() {
  const fallback: WebBuildEnv = {
    MARKETPLACE_URL: "http://localhost:3000",
    version: 1,
  };
  const raw: unknown = process.env.HANDSHAKE_DETAILS;
  if (!raw) {
    return fallback;
  }
  let candidate: unknown = raw;
  try {
    if (typeof raw === "string") {
      candidate = JSON.parse(raw);
    }
  } catch {
    return fallback;
  }
  const parsed = webBuildEnvSchema.safeParse(candidate);
  return parsed.success ? parsed.data : fallback;
}

export function resolveMarketplaceWebSocketUrl() {
  const env = resolveWebBuildEnv();
  const url = new URL(env.MARKETPLACE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function resolveMarketplaceHttpBaseUrl() {
  const env = resolveWebBuildEnv();
  const url = new URL(env.MARKETPLACE_URL);
  return url.toString();
}
