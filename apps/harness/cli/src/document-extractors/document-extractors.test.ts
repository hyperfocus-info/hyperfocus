import { describe, expect, test } from "bun:test";
import { extractDocumentText } from "./index";
import { createResourceBudget } from "./types";
import {
  createSampleDocxBuffer,
  createSampleOdtBuffer,
  createSamplePdfBuffer,
  createSamplePptxBuffer,
  createSampleXlsxBuffer,
  createScanOnlyPdfBuffer,
  createStoredZip
} from "./test-fixtures";

describe("document extractors", () => {
  test("extracts text from supported document formats", async () => {
    const pdfResult = await extractDocumentText(
      {
        id: "pdf",
        kind: "document",
        documentType: "pdf",
        name: "spec.pdf",
        mimeType: "application/pdf",
        sizeBytes: createSamplePdfBuffer().length,
        url: "https://example.com/spec.pdf",
        key: "pdf",
        uploadedAt: new Date().toISOString()
      },
      createSamplePdfBuffer()
    );
    expect(pdfResult).toEqual({
      status: "ok",
      text: "Hello PDF extraction"
    });

    const docxResult = await extractDocumentText(
      {
        id: "docx",
        kind: "document",
        documentType: "docx",
        name: "brief.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: createSampleDocxBuffer().length,
        url: "https://example.com/brief.docx",
        key: "docx",
        uploadedAt: new Date().toISOString()
      },
      createSampleDocxBuffer()
    );
    expect(docxResult).toEqual({
      status: "ok",
      text: "Docx intro\nCell A1\tCell B1"
    });

    const xlsxResult = await extractDocumentText(
      {
        id: "xlsx",
        kind: "document",
        documentType: "xlsx",
        name: "backlog.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: createSampleXlsxBuffer().length,
        url: "https://example.com/backlog.xlsx",
        key: "xlsx",
        uploadedAt: new Date().toISOString()
      },
      createSampleXlsxBuffer()
    );
    expect(xlsxResult).toEqual({
      status: "ok",
      text: "Sheet: Backlog\nTask\tShip docs"
    });

    const pptxResult = await extractDocumentText(
      {
        id: "pptx",
        kind: "document",
        documentType: "pptx",
        name: "deck.pptx",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        sizeBytes: createSamplePptxBuffer().length,
        url: "https://example.com/deck.pptx",
        key: "pptx",
        uploadedAt: new Date().toISOString()
      },
      createSamplePptxBuffer()
    );
    expect(pptxResult).toEqual({
      status: "ok",
      text: "Slide 1\nSlide heading\nFollow-up bullet"
    });

    const odtResult = await extractDocumentText(
      {
        id: "odt",
        kind: "document",
        documentType: "odt",
        name: "notes.odt",
        mimeType: "application/vnd.oasis.opendocument.text",
        sizeBytes: createSampleOdtBuffer().length,
        url: "https://example.com/notes.odt",
        key: "odt",
        uploadedAt: new Date().toISOString()
      },
      createSampleOdtBuffer()
    );
    expect(odtResult).toEqual({
      status: "ok",
      text: "ODT heading\nODT paragraph\n- First item\nTable A1\tTable B1"
    });
  });

  test("marks textless pdfs as OCR follow-up work", async () => {
    const result = await extractDocumentText(
      {
        id: "scan",
        kind: "document",
        documentType: "pdf",
        name: "scan.pdf",
        mimeType: "application/pdf",
        sizeBytes: createScanOnlyPdfBuffer().length,
        url: "https://example.com/scan.pdf",
        key: "scan",
        uploadedAt: new Date().toISOString()
      },
      createScanOnlyPdfBuffer()
    );

    expect(result).toEqual({
      status: "ocr-required",
      reason: "PDF pages loaded, but no extractable text was found. OCR is not implemented yet."
    });
  });

  test("enforces configurable archive and output budgets before unbounded work", async () => {
    const attachment = {
      id: "docx-budget",
      kind: "document" as const,
      documentType: "docx" as const,
      name: "budget.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: createSampleDocxBuffer().length,
      url: "https://example.com/budget.docx",
      key: "docx-budget",
      uploadedAt: new Date().toISOString()
    };

    await expect(extractDocumentText(attachment, createSampleDocxBuffer(), { maxItems: 0 }))
      .rejects.toThrow("0 item budget");
    await expect(extractDocumentText(attachment, createSampleDocxBuffer(), { maxEntryBytes: 32 }))
      .rejects.toThrow("32 byte entry budget");
    await expect(extractDocumentText(attachment, createSampleDocxBuffer(), { maxOutputChars: 4 }))
      .rejects.toThrow("4 character output budget");
  });

  test("does not inflate unrelated Office media entries", async () => {
    const documentXml = [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      "<w:body><w:p><w:r><w:t>Relevant only</w:t></w:r></w:p></w:body>",
      "</w:document>"
    ].join("");
    const archive = createStoredZip([
      { name: "word/document.xml", content: documentXml },
      { name: "word/media/ignored.bin", content: new Uint8Array(4096) }
    ]);
    const result = await extractDocumentText(
      {
        id: "docx-media",
        kind: "document",
        documentType: "docx",
        name: "media.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: archive.length,
        url: "https://example.com/media.docx",
        key: "docx-media",
        uploadedAt: new Date().toISOString()
      },
      archive,
      { maxExpandedBytes: documentXml.length }
    );

    expect(result).toEqual({ status: "ok", text: "Relevant only" });
  });
});

describe("document resource budget", () => {
  test("allows exact item and byte limits", () => {
    const budget = createResourceBudget({ maxItems: 2, maxBytes: 5 });
    budget.consumeItems(2, "archive");
    budget.consumeBytes(5, "archive");
    expect(budget.snapshot()).toMatchObject({ items: 2, bytes: 5 });
  });

  test("rejects work beyond item and byte limits", () => {
    const itemBudget = createResourceBudget({ maxItems: 1 });
    itemBudget.consumeItems(1, "archive");
    expect(() => itemBudget.consumeItems(1, "archive")).toThrow("1 item budget");

    const byteBudget = createResourceBudget({ maxBytes: 4 });
    expect(() => byteBudget.consumeBytes(5, "archive")).toThrow("4 byte budget");
  });

  test("checks elapsed time and abort signals", () => {
    let currentTime = 10;
    const timedBudget = createResourceBudget({ maxDurationMs: 5 }, () => currentTime);
    currentTime = 16;
    expect(() => timedBudget.check("parse")).toThrow("5 ms time budget");

    const controller = new AbortController();
    const abortedBudget = createResourceBudget({ signal: controller.signal });
    controller.abort("cancelled");
    expect(() => abortedBudget.check("parse")).toThrow("parse was aborted");
  });

  test("rejects invalid limits and counts", () => {
    expect(() => createResourceBudget({ maxItems: 1.5 })).toThrow("maxItems");
    expect(() => createResourceBudget({ maxBytes: -1 })).toThrow("maxBytes");
    const budget = createResourceBudget();
    expect(() => budget.consumeBytes(Number.NaN, "parse")).toThrow("byte count");
  });
});
