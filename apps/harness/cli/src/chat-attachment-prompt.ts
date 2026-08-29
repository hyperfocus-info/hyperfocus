import type { ImageContent } from "@mariozechner/pi-ai";
import {
  MAX_CHAT_ATTACHMENT_DOCUMENT_BYTES,
  MAX_CHAT_ATTACHMENT_IMAGE_BYTES,
  MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT,
  MAX_CHAT_ATTACHMENT_TEXT_BYTES,
  MAX_CHAT_ATTACHMENT_TEXT_CHARS,
  MAX_CHAT_ATTACHMENT_TOTAL_NON_IMAGE_CHARS
} from "@hyperfocus/ai-core/chat-attachments";
import type { ChatAttachment, ChatMessage } from "@hyperfocus/ai-core/protocol";
import { readBoundedResponseBody } from "./bounded-output-buffer";
import { extractDocumentText, type DocumentExtractionOptions, type DocumentExtractionResult } from "./document-extractors";
import type { CacheableUserBlock } from "./prompt-cache-assembly";
import type { GeminiCachedAttachmentContext } from "./gemini-cached-contents";

type PromptAttachmentContext = {
  transcript: string;
  images: ImageContent[];
  cacheableUserBlocks: CacheableUserBlock[];
};

type TextBudget = {
  remainingChars: number;
};

type AttachmentPromptPart = {
  transcript: string;
  image?: ImageContent;
  cacheableUserBlock?: CacheableUserBlock;
};

type CachedAttachmentContent =
  | { kind: "document"; result: DocumentExtractionResult }
  | { kind: "text"; text: string };

export type BoundedAsyncCache<Key, Value> = {
  getOrCreate(key: Key, load: () => Promise<Value>): Promise<Value>;
  clear(): void;
  readonly size: number;
};

export function createBoundedAsyncCache<Key, Value>(
  options: { maxEntries?: number } = {}
): BoundedAsyncCache<Key, Value> {
  const maxEntries = options.maxEntries ?? 32;
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new RangeError("maxEntries must be a positive safe integer");
  }

  const entries = new Map<Key, Promise<Value>>();
  return {
    getOrCreate(key, load) {
      const existing = entries.get(key);
      if (existing) {
        entries.delete(key);
        entries.set(key, existing);
        return existing;
      }
      const pending = load();
      entries.set(key, pending);
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
      }
      void pending.then(undefined, () => {
        if (entries.get(key) === pending) entries.delete(key);
      });
      return pending;
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    }
  };
}

export type AttachmentContentCache = BoundedAsyncCache<string, CachedAttachmentContent>;

export type AttachmentPromptOptions = {
  geminiCachedAttachmentContext?: GeminiCachedAttachmentContext;
  attachmentCache?: AttachmentContentCache;
  documentExtraction?: DocumentExtractionOptions;
  signal?: AbortSignal;
};

const defaultAttachmentCache = createAttachmentContentCache();

export function createAttachmentContentCache(options: { maxEntries?: number } = {}): AttachmentContentCache {
  return createBoundedAsyncCache(options);
}

export async function buildPromptAttachmentContext(
  messages: ChatMessage[],
  options: AttachmentPromptOptions = {}
): Promise<PromptAttachmentContext> {
  const visibleMessages = messages.filter((message) => message.role !== "system");
  if (visibleMessages.length === 0) {
    return {
      transcript: "(no prior messages)",
      images: [],
      cacheableUserBlocks: []
    };
  }

  const images: ImageContent[] = [];
  const cacheableUserBlocks: CacheableUserBlock[] = [];
  const transcriptParts: string[] = [];
  const textBudget: TextBudget = {
    remainingChars: MAX_CHAT_ATTACHMENT_TOTAL_NON_IMAGE_CHARS
  };

  for (const message of visibleMessages) {
    transcriptParts.push(`${message.role.toUpperCase()}: ${message.content}`);
    if (!message.attachments?.length) {
      continue;
    }

    for (const attachment of message.attachments) {
      const attachmentPart = await describeAttachment(message.role, attachment, images.length + 1, textBudget, options);
      transcriptParts.push(attachmentPart.transcript);
      if (attachmentPart.cacheableUserBlock) {
        cacheableUserBlocks.push(attachmentPart.cacheableUserBlock);
      }
      if (attachmentPart.image && images.length < MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT) {
        images.push(attachmentPart.image);
      }
    }
  }

  return {
    transcript: transcriptParts.join("\n"),
    images,
    cacheableUserBlocks
  };
}

async function describeAttachment(
  role: ChatMessage["role"],
  attachment: ChatAttachment,
  imageOrdinal: number,
  textBudget: TextBudget,
  options: AttachmentPromptOptions
): Promise<AttachmentPromptPart> {
  if (attachment.kind === "image") {
    if (imageOrdinal > MAX_CHAT_ATTACHMENT_IMAGES_PER_PROMPT) {
      return {
        transcript: `[Attachment image skipped] ${role} attached ${attachment.name}; image limit reached.`
      };
    }

    try {
      const response = await fetch(attachment.url, { signal: options.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const imageBuffer = await readBoundedResponseBody(response, {
        maxBytes: MAX_CHAT_ATTACHMENT_IMAGE_BYTES,
        label: `Attachment ${attachment.name}`,
        signal: options.signal
      });
      return {
        transcript: `[Attachment image ${imageOrdinal}] ${role} attached ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes).`,
        image: {
          type: "image" as const,
          data: imageBuffer.toString("base64"),
          mimeType: attachment.mimeType
        }
      };
    } catch (error) {
      return {
        transcript: `[Attachment image unavailable] ${attachment.name}: ${
          error instanceof Error ? error.message : "unknown fetch failure"
        }.`
      };
    }
  }

  if (options.geminiCachedAttachmentContext?.attachmentKeys.includes(attachment.key)) {
    return {
      transcript: `[Attachment cached] ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes) via ${options.geminiCachedAttachmentContext.cachedContentName}`
    };
  }

  if (textBudget.remainingChars <= 0) {
    return formatExhaustedAttachmentTranscript(role, attachment);
  }

  try {
    const cache = options.attachmentCache ?? defaultAttachmentCache;
    const content = await cache.getOrCreate(
      buildAttachmentCacheKey(attachment),
      () => loadNonImageAttachment(attachment, options)
    );
    if (content.kind === "document") {
      const extractionResult = content.result;
      if (extractionResult.status === "ocr-required") {
        return {
          transcript: `[Attachment document OCR required] ${attachment.name}: ${extractionResult.reason}`
        };
      }

      if (extractionResult.status === "no-text") {
        return {
          transcript: `[Attachment document unavailable] ${attachment.name}: ${extractionResult.reason}`
        };
      }

      return formatNonImageAttachmentTranscript({
          role,
          attachment,
          label: `Attachment document ${attachment.documentType ?? "unknown"}`,
          content: extractionResult.text,
          emptyText: "Attachment contents: (no extractable text)"
        }, textBudget);
    }

    return formatNonImageAttachmentTranscript({
        role,
        attachment,
        label: "Attachment text",
        content: content.text,
        emptyText: "Attachment contents: (empty file)"
      }, textBudget);
  } catch (error) {
    const kindLabel = attachment.kind === "document" ? "document unavailable" : "text unavailable";
    return {
      transcript: `[Attachment ${kindLabel}] ${attachment.name}: ${
        error instanceof Error ? error.message : "unknown fetch failure"
      }.`
    };
  }
}

async function loadNonImageAttachment(
  attachment: ChatAttachment,
  options: AttachmentPromptOptions
): Promise<CachedAttachmentContent> {
  const response = await fetch(attachment.url, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const maxBytes = attachment.kind === "document"
    ? MAX_CHAT_ATTACHMENT_DOCUMENT_BYTES
    : MAX_CHAT_ATTACHMENT_TEXT_BYTES;
  const body = await readBoundedResponseBody(response, {
    maxBytes,
    label: `Attachment ${attachment.name}`,
    signal: options.signal
  });
  if (attachment.kind === "document") {
    return {
      kind: "document",
      result: await extractDocumentText(attachment, body, {
        ...options.documentExtraction,
        maxInputBytes: options.documentExtraction?.maxInputBytes ?? MAX_CHAT_ATTACHMENT_DOCUMENT_BYTES,
        signal: options.signal ?? options.documentExtraction?.signal
      })
    };
  }

  return { kind: "text", text: body.toString("utf8").trim() };
}

function buildAttachmentCacheKey(attachment: ChatAttachment) {
  return [
    attachment.key,
    attachment.kind,
    attachment.documentType ?? "",
    attachment.mimeType,
    attachment.sizeBytes
  ].join(":");
}

function formatExhaustedAttachmentTranscript(
  role: ChatMessage["role"],
  attachment: ChatAttachment
): AttachmentPromptPart {
  const label = attachment.kind === "document"
    ? `Attachment document ${attachment.documentType ?? "unknown"}`
    : "Attachment text";
  const header = `[${label}] ${role} attached ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes).`;
  return {
    transcript: [header, "Attachment contents: text budget exhausted before this attachment."].join("\n")
  };
}

function formatNonImageAttachmentTranscript(
  input: {
    role: ChatMessage["role"];
    attachment: ChatAttachment;
    label: string;
    content: string;
    emptyText: string;
  },
  textBudget: TextBudget
): AttachmentPromptPart {
  const header = `[${input.label}] ${input.role} attached ${input.attachment.name} (${input.attachment.mimeType}, ${input.attachment.sizeBytes} bytes).`;
  const trimmedContent = input.content.trim();
  if (!trimmedContent) {
    return { transcript: [header, input.emptyText].join("\n") };
  }

  if (textBudget.remainingChars <= 0) {
    return { transcript: [header, "Attachment contents: text budget exhausted before this attachment."].join("\n") };
  }

  const allowedChars = Math.min(MAX_CHAT_ATTACHMENT_TEXT_CHARS, textBudget.remainingChars);
  const consumedChars = Math.min(trimmedContent.length, allowedChars);
  const truncated = trimmedContent.length > allowedChars;
  const visibleContent = truncated ? `${trimmedContent.slice(0, allowedChars)}\n...[truncated]` : trimmedContent;
  textBudget.remainingChars -= consumedChars;

  if (visibleContent.length >= 4000) {
    return {
      transcript: [header, "Attachment contents: moved to cacheable context block."].join("\n"),
      cacheableUserBlock: {
        kind: "uploadthing-attachment" as const,
        title: `${input.label}: ${input.attachment.name}`,
        text: [header, `Attachment contents:\n${visibleContent}`].join("\n")
      }
    };
  }

  return { transcript: [header, `Attachment contents:\n${visibleContent}`].join("\n") };
}
