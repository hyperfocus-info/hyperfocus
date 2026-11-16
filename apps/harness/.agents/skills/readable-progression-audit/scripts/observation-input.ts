import type { StarterGuardrailCarrier } from "./starter_guardrails";

export type Observation = {
  game?: string;
  title?: string;
  notes?: string[];
  proximalGoalVisible?: boolean;
  prerequisiteVisible?: boolean;
  evaluativeReadback?: boolean;
  nextStepGuidance?: boolean;
  reminderRecovery?: boolean;
  evidence?: string[];
  starter?: StarterGuardrailCarrier;
};

export function isProgressionObservation(value: unknown): value is Observation {
  return (typeof value === "object" && value !== null && !Array.isArray(value)
    && (!("game" in value) || value.game === undefined || (typeof value.game === "string"))
    && (!("title" in value) || value.title === undefined || (typeof value.title === "string"))
    && (!("notes" in value) || value.notes === undefined || (Array.isArray(value.notes) && value.notes.every((entry0: unknown) => typeof entry0 === "string")))
    && (!("proximalGoalVisible" in value) || value.proximalGoalVisible === undefined || (typeof value.proximalGoalVisible === "boolean"))
    && (!("prerequisiteVisible" in value) || value.prerequisiteVisible === undefined || (typeof value.prerequisiteVisible === "boolean"))
    && (!("evaluativeReadback" in value) || value.evaluativeReadback === undefined || (typeof value.evaluativeReadback === "boolean"))
    && (!("nextStepGuidance" in value) || value.nextStepGuidance === undefined || (typeof value.nextStepGuidance === "boolean"))
    && (!("reminderRecovery" in value) || value.reminderRecovery === undefined || (typeof value.reminderRecovery === "boolean"))
    && (!("evidence" in value) || value.evidence === undefined || (Array.isArray(value.evidence) && value.evidence.every((entry1: unknown) => typeof entry1 === "string")))
    && (!("starter" in value) || value.starter === undefined || ((typeof value.starter === "object" && value.starter !== null && !Array.isArray(value.starter)
    && ("title" in value.starter && (typeof value.starter.title === "string"))
    && ("summary" in value.starter && (typeof value.starter.summary === "string"))
    && ("claims" in value.starter && (Array.isArray(value.starter.claims) && value.starter.claims.every((entry2: unknown) => (typeof entry2 === "object" && entry2 !== null && !Array.isArray(entry2)
    && ("claim" in entry2 && (typeof entry2.claim === "string"))
    && ("evidence" in entry2 && (Array.isArray(entry2.evidence) && entry2.evidence.every((entry3: unknown) => typeof entry3 === "string")))
    && ("sufficiency" in entry2 && ((entry2.sufficiency === "insufficient" || entry2.sufficiency === "partial" || entry2.sufficiency === "sufficient")))
    && ("nextEvidence" in entry2 && (Array.isArray(entry2.nextEvidence) && entry2.nextEvidence.every((entry4: unknown) => typeof entry4 === "string")))))))))));
}
