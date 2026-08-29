import { Buffer } from "node:buffer";
import { detectChatDocumentType } from "@hyperfocus/ai-core/chat-attachments";
import type { ChatAttachment } from "@hyperfocus/ai-core/protocol";
import { extractDocxText } from "./extract-docx";
import { extractOdtText } from "./extract-odt";
import { extractPptxText } from "./extract-pptx";
import { extractXlsxText } from "./extract-xlsx";
import type { DocumentExtractionOptions, DocumentExtractionResult } from "./types";
import { getHarnessCapacityGovernor } from "../execution-runtime";

export type { DocumentExtractionOptions, DocumentExtractionResult } from "./types";

export async function extractDocumentText(
  attachment: ChatAttachment,
  input: ArrayBuffer | Uint8Array | Buffer,
  options: DocumentExtractionOptions = {}
): Promise<DocumentExtractionResult> {
  return getHarnessCapacityGovernor().run({ resources: { document: 1 }, signal: options.signal }, () =>
    extractDocumentTextWithinCapacity(attachment, input, options));
}

async function extractDocumentTextWithinCapacity(
  attachment: ChatAttachment,
  input: ArrayBuffer | Uint8Array | Buffer,
  options: DocumentExtractionOptions
): Promise<DocumentExtractionResult> {
  const documentType = attachment.documentType ?? detectChatDocumentType(attachment);
  if (!documentType) {
    return {
      status: "no-text",
      reason: `Unsupported document type for ${attachment.name}.`
    };
  }

  switch (documentType) {
    case "pdf":
      return extractPdfText(input, options);
    case "docx":
      return extractDocxText(input, options);
    case "xlsx":
      return extractXlsxText(input, options);
    case "pptx":
      return extractPptxText(input, options);
    case "odt":
      return extractOdtText(input, options);
  }
}

async function extractPdfText(input: ArrayBuffer | Uint8Array | Buffer, options: DocumentExtractionOptions) {
  const { extractPdfText } = await import("./extract-pdf");
  return extractPdfText(input, options);
}
