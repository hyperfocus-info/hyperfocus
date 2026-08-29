export const HARNESS_SESSION_TOKEN_QUERY = "harnessSession";
export const HARNESS_SESSION_TOKEN_HEADER = "x-harness-session-token";

export function readHarnessSessionToken(documentRoot: Pick<Document, "querySelector"> = document) {
  const token = documentRoot.querySelector<HTMLMetaElement>('meta[name="harness-session-token"]')?.content.trim();
  if (!token) throw new Error("Harness session capability is missing; reload this page from the running Harness server");
  return token;
}

export function authorizeHarnessUrl(input: string | URL, sessionToken: string) {
  const url = new URL(input);
  url.searchParams.set(HARNESS_SESSION_TOKEN_QUERY, sessionToken);
  return url;
}
