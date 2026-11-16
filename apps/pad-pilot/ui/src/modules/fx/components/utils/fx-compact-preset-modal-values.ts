
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Preset code could not be applied.";
}
