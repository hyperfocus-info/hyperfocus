import type { PadPilotModuleDefinition } from "./module-runtime";
export function isModuleDefinitionShape(value: unknown): value is Partial<PadPilotModuleDefinition> {
 if (typeof value !== "object" || value === null) return false;
 return "Component" in value && typeof value.Component === "function" && (!("register" in value) || value.register === undefined || typeof value.register === "function");
}
