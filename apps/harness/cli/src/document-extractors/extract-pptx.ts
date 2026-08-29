import {
  collectByLocalName,
  enforceExtractedTextBudget,
  getAttribute,
  getChildObject,
  getChildObjects,
  normalizeExtractedText,
  parseXmlDocument,
  readOfficeZipEntries,
  resolveZipPath
} from "./extract-office-zip";
import type { DocumentExtractionOptions, DocumentExtractionResult } from "./types";

export async function extractPptxText(
  input: ArrayBuffer | Uint8Array | Buffer,
  options: DocumentExtractionOptions = {}
): Promise<DocumentExtractionResult> {
  const entries = await readOfficeZipEntries(input, {
    ...options,
    includeEntry: (path) => path === "ppt/presentation.xml"
      || path === "ppt/_rels/presentation.xml.rels"
      || path.startsWith("ppt/slides/")
  });
  const presentationXml = entries.get("ppt/presentation.xml");
  const relationshipsXml = entries.get("ppt/_rels/presentation.xml.rels");
  if (!presentationXml || !relationshipsXml) {
    throw new Error("Missing presentation metadata in PPTX file");
  }

  const presentation = getChildObject(parseXmlDocument(presentationXml), "p:presentation");
  const relationships = getChildObject(parseXmlDocument(relationshipsXml), "Relationships");
  if (!presentation || !relationships) {
    throw new Error("Presentation metadata could not be parsed");
  }

  const relationshipMap = new Map(
    getChildObjects(relationships, "Relationship")
      .map((relationship) => {
        const id = getAttribute(relationship, "Id");
        const target = getAttribute(relationship, "Target");
        if (!id || !target) {
          return undefined;
        }

        return [id, resolveZipPath("ppt/presentation.xml", target)] as const;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry))
  );

  const slideBlocks = getChildObjects(getChildObject(presentation, "p:sldIdLst"), "p:sldId")
    .map((slide, index) => {
      const relationshipId = getAttribute(slide, "r:id");
      const slidePath = relationshipId ? relationshipMap.get(relationshipId) : undefined;
      if (!slidePath) {
        return undefined;
      }

      const slideXml = entries.get(slidePath);
      if (!slideXml) {
        return undefined;
      }

      const slideText = collectByLocalName(parseXmlDocument(slideXml), "t").join("\n").trim();
      return slideText ? `Slide ${index + 1}\n${slideText}` : `Slide ${index + 1}\n(no extractable text)`;
    })
    .filter((value): value is string => Boolean(value));

  const text = enforceExtractedTextBudget(normalizeExtractedText(slideBlocks.join("\n\n")), options);
  if (!text) {
    return {
      status: "no-text",
      reason: "No extractable text found in the PPTX deck."
    };
  }

  return {
    status: "ok",
    text
  };
}
