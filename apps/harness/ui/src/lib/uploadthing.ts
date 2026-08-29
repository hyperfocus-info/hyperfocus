import { genUploader } from "uploadthing/client";
import type { HarnessUploadRouter } from "../../../cli/src/uploadthing-router";
import { HARNESS_SESSION_TOKEN_HEADER, readHarnessSessionToken } from "../transport/harness-session";

function createHarnessUploader() {
  return genUploader<HarnessUploadRouter>({
    url: typeof window === "undefined" ? "http://localhost/api/uploadthing" : `${window.location.origin}/api/uploadthing`,
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set(HARNESS_SESSION_TOKEN_HEADER, readHarnessSessionToken());
      return globalThis.fetch(input, { ...init, headers });
    }
  });
}

export async function uploadFiles(...args: Parameters<ReturnType<typeof createHarnessUploader>["uploadFiles"]>) {
  return createHarnessUploader().uploadFiles(...args);
}
