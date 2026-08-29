const DEFAULT_TARGET_INTERVAL_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 10_000;

function createStreamChunk(index: number, content: string, startedAt: string, updatedAt: string, closed: boolean) {
  return { index, content, startedAt, updatedAt, closed };
}

export type AssistantStreamChunk = ReturnType<typeof createStreamChunk>;

export function createAssistantStreamChunker(
  options: { targetIntervalMs?: number; maxWaitMs?: number } = {}
) {
  const targetIntervalMs = options.targetIntervalMs ?? DEFAULT_TARGET_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const chunks: AssistantStreamChunk[] = [];
  let open = "";
  let openStartedAt = 0;
  let openStartedIso = "";
  let openUpdatedIso = "";

  const closeReadyChunks = (nowMs: number, force: boolean) => {
    while (open.trim()) {
      const elapsed = nowMs - openStartedAt;
      const boundary = force ? open.length : findSplitBoundary(open, elapsed >= maxWaitMs);
      if (boundary === undefined) {
        return;
      }
      if (!force && elapsed < targetIntervalMs) {
        return;
      }

      const content = open.slice(0, boundary).trimEnd();
      if (!content.trim()) {
        open = open.slice(boundary);
        continue;
      }

      chunks.push(
        createStreamChunk(
          chunks.length,
          content,
          openStartedIso || new Date(nowMs).toISOString(),
          openUpdatedIso || new Date(nowMs).toISOString(),
          true
        )
      );

      open = open.slice(boundary).trimStart();
      openStartedAt = nowMs;
      openStartedIso = new Date(nowMs).toISOString();
      openUpdatedIso = openStartedIso;

      if (!force) {
        return;
      }
    }
  };

  const append = (delta: string, nowMs = Date.now()) => {
    if (!delta) {
      return;
    }

    const nowIso = new Date(nowMs).toISOString();
    if (!open) {
      openStartedAt = nowMs;
      openStartedIso = nowIso;
    }

    open += delta;
    openUpdatedIso = nowIso;
    closeReadyChunks(nowMs, false);
  };

  const hasContent = () => chunks.length > 0 || Boolean(open.trim());

  const seed = (content: string, nowMs = Date.now()) => {
    if (hasContent() || !content.trim()) {
      return;
    }
    append(content, nowMs);
  };

  const flush = (nowMs = Date.now()) => closeReadyChunks(nowMs, true);

  const getChunks = () => {
    const result = [...chunks];
    if (open.trim()) {
      result.push(
        createStreamChunk(
          result.length,
          open,
          openStartedIso || new Date().toISOString(),
          openUpdatedIso || new Date().toISOString(),
          false
        )
      );
    }
    return result;
  };

  return { append, seed, flush, getChunks, hasContent };
}

function findSplitBoundary(input: string, allowWhitespaceFallback: boolean) {
  const candidates = [
    findClosedCodeFenceBoundary(input),
    findParagraphBoundary(input),
    findListItemBoundary(input),
    findSentenceBoundary(input)
  ].filter((candidate): candidate is number => candidate !== undefined && candidate > 0);
  if (candidates.length > 0) {
    return Math.min(...candidates);
  }
  if (!allowWhitespaceFallback) {
    return undefined;
  }
  const whitespace = findLastWhitespaceBoundary(input);
  return whitespace > 0 ? whitespace : input.length;
}

function findParagraphBoundary(input: string) {
  const index = input.indexOf("\n\n");
  return index >= 0 ? index + 2 : undefined;
}

function findClosedCodeFenceBoundary(input: string) {
  const matches = [...input.matchAll(/```/g)];
  return matches.length >= 2 && matches.length % 2 === 0 ? (matches.at(-1)?.index ?? 0) + 3 : undefined;
}

function findListItemBoundary(input: string) {
  const match = /\n(?:[-*+]|\d+\.)\s+.+(?:\n|$)(?![\s\S]*\n(?:[-*+]|\d+\.)\s+.+(?:\n|$))/.exec(input);
  return match?.index === undefined ? undefined : match.index + match[0].length;
}

function findSentenceBoundary(input: string) {
  const match = /[.!?](?=\s|$)/.exec(input);
  return match?.index === undefined ? undefined : match.index + 1;
}

function findLastWhitespaceBoundary(input: string) {
  for (let index = input.length - 1; index > 0; index -= 1) {
    if (/\s/.test(input[index] ?? "")) {
      return index + 1;
    }
  }
  return -1;
}
