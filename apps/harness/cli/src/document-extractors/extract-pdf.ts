import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createResourceBudget } from "./types";
import { normalizeExtractedText } from "./extract-office-zip";
import type { DocumentExtractionOptions, DocumentExtractionResult } from "./types";

const defaultMaxPdfPages = 512;
const defaultMaxPdfOutputChars = 1_000_000;
const defaultMaxPdfDurationMs = 10_000;

export async function extractPdfText(
  input: ArrayBuffer | Uint8Array | Buffer,
  options: DocumentExtractionOptions = {}
): Promise<DocumentExtractionResult> {
  const data = toPdfUint8Array(input);
  const maxInputBytes = options.maxInputBytes ?? 16 * 1024 * 1024;
  const maxOutputChars = options.maxOutputChars ?? defaultMaxPdfOutputChars;
  validateLimit(maxInputBytes, "maxInputBytes");
  validateLimit(maxOutputChars, "maxOutputChars");
  if (data.byteLength > maxInputBytes) {
    throw new RangeError(`PDF exceeded the ${maxInputBytes.toLocaleString("en-US")} byte input budget`);
  }

  const budget = createResourceBudget({
    maxItems: options.maxItems ?? defaultMaxPdfPages,
    maxDurationMs: options.maxDurationMs ?? defaultMaxPdfDurationMs,
    signal: options.signal
  });
  budget.check("PDF extraction");
  const loadingTask = getDocument({
    data,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    disableFontFace: true,
    stopAtErrors: false,
    verbosity: VerbosityLevel.ERRORS
  });

  const pdfDocument = await loadingTask.promise;
  try {
    const pageTexts: string[] = [];
    let outputChars = 0;
    budget.consumeItems(pdfDocument.numPages, "PDF extraction");
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      budget.check("PDF extraction");
      const page = await pdfDocument.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        const pageParts: string[] = [];
        for (const item of textContent.items) {
          budget.check("PDF extraction");
          const itemText = "str" in item ? item.str : "";
          if (!itemText) continue;
          outputChars += itemText.length + (pageParts.length > 0 ? 1 : 0);
          if (outputChars > maxOutputChars) {
            throw new RangeError(
              `Extracted PDF text exceeded the ${maxOutputChars.toLocaleString("en-US")} character output budget`
            );
          }
          pageParts.push(itemText);
        }

        const pageText = pageParts.join(" ").trim();
        if (pageText) {
          pageTexts.push(pageText);
        }
      } finally {
        page.cleanup();
      }
    }

    const text = normalizeExtractedText(pageTexts.join("\n\n"));
    if (!text) {
      return pdfDocument.numPages > 0
        ? {
            status: "ocr-required",
            reason: "PDF pages loaded, but no extractable text was found. OCR is not implemented yet."
          }
        : {
            status: "no-text",
            reason: "No extractable text found in the PDF."
          };
    }

    return {
      status: "ok",
      text
    };
  } finally {
    await pdfDocument.destroy();
  }
}

function validateLimit(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function toPdfUint8Array(input: ArrayBuffer | Uint8Array | Buffer) {
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
}
