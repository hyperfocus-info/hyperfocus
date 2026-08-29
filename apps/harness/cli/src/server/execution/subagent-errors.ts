export function isTransientSubagentError(error: Error) {
  const value = error.message.toLowerCase();
  return ["timeout", "temporar", "429", "rate limit", "overload", "network", "socket", "econn", "reset"]
    .some((token) => value.includes(token));
}
