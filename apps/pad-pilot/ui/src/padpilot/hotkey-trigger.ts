import type { PadPilotTriggerDefinition } from "./hotkeys";
export const isTriggerDefinition = (value: unknown): value is PadPilotTriggerDefinition =>
  typeof value === "object" &&
  value !== null &&
  ("controller" in value || "keyboard" in value);
