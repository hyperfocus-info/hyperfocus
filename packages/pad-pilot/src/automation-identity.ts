export const MAX_AUTOMATION_PARAMETER_ID_BYTES = 64;

const AUTOMATION_PARAMETER_ID_PATTERN = /^[A-Za-z0-9._]+$/;

export function isValidAutomationParameterId(value: string) {
  return value.length > 0 &&
    AUTOMATION_PARAMETER_ID_PATTERN.test(value) &&
    new TextEncoder().encode(value).length <= MAX_AUTOMATION_PARAMETER_ID_BYTES;
}
