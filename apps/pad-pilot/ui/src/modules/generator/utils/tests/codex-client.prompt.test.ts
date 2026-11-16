import { asRecord } from "@hyperfocus/utilities/records";
import { afterEach, describe, expect, it } from "bun:test";
import { buildGeneratorPromptEnvelope, extractGeneratorArrangementPlan, extractGeneratorAiIntentTags } from "../generator-prompt";
import {
  restoreCodexClientTestEnvironment,
} from "../codex-client.test-helpers";

describe("codex client prompt", () => {
  afterEach(restoreCodexClientTestEnvironment);

  it("builds a tag-first prompt envelope without requiring a genre bucket", () => {
    const envelope = buildGeneratorPromptEnvelope({
      lengthBars: 4,
      mood: "Happy",
      notes: "bright hook with simple tense chords",
    });

    expect(envelope.intentPlan.tags.selector).toContain("happy");
    expect(envelope.intentPlan.tags.selector).toContain("bright-hook-with-simple-tense-chords");
    expect(envelope.intentPlan.tags.all).toContain("happy");
    expect(envelope.grammarVersion).toBe("delta-tracker-v2");
    expect(envelope.schemaVersion).toBe("generator-model-envelope-v1");
    expect(envelope.jsonSchema.required).toContain("tracker");
    expect(envelope.user).toContain("Generator Intent Plan:");
    expect(envelope.user).toContain("Weighted Selector Tags:");
    expect(envelope.user).toContain("Avoid Rules:");
    expect(envelope.user).toContain("genre is not a special branch");
    expect(envelope.user).toContain("JSON schema mode: include required arrangementPlan");
    expect(envelope.user).not.toContain("include optional arrangementPlan");
    expect(envelope.system).toContain("Genre is one tag source");
  });

  it("keeps the structured output schema strict for Codex CLI", () => {
    const envelope = buildGeneratorPromptEnvelope({ genre: "Funk" });
    const visitSchema = (schema: unknown) => {
      if (!schema || typeof schema !== "object") {
        return;
      }
      const node = asRecord(schema);
      const properties = node.properties && typeof node.properties === "object"
        ? asRecord(node.properties)
        : undefined;
      if (properties) {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(properties));
        for (const child of Object.values(properties)) {
          visitSchema(child);
        }
      }
      if (node.items) {
        visitSchema(node.items);
      }
    };

    visitSchema(envelope.jsonSchema);
  });

  it("normalizes AI output theme and groove tags for deterministic massage", () => {
    expect(extractGeneratorAiIntentTags("!BPM:92!\n!TAGS: Theme=Soulful, Jazzy Chords; Groove=Boom Bap, Syncopation !\n#TRK:Drums,CH:9,PG:0\n[0,36,90,120]")).toEqual({
      grooveTags: ["boom-bap", "syncopated"],
      themeTags: ["soulful", "jazzy-chords"],
    });
  });

  it("normalizes AI output arrangement plan handoff fields", () => {
    expect(extractGeneratorArrangementPlan("!BPM:72!\n!PLAN:STYLE=Ambient;GRID=straight;BASS=pedal;FORM=static-loop;MOTIF=texture;ROLES=chord comp,pedal bass,lead motif;CONFIDENCE=0.83!\n#TRK:Pad,CH:0,PG:88\n[0,60,80,480]")).toEqual({
      bass: "pedal",
      confidence: 0.83,
      form: "static-loop",
      grid: "straight",
      motif: "texture",
      phraseFunction: "",
      roles: ["chord-comp", "pedal-bass", "lead-motif"],
      style: "ambient",
    });
  });

  it("keeps prompt drum guidance aligned with the style gate", () => {
    expect(buildGeneratorPromptEnvelope({ genre: "Ambient", lengthBars: 8 }).user)
      .toContain("do not invent drums or phrase fills");
    expect(buildGeneratorPromptEnvelope({ genre: "Drill", lengthBars: 8 }).user)
      .toContain("Drum identity is required");
  });
});
