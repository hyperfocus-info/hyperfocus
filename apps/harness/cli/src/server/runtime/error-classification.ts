

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function formatUnknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
