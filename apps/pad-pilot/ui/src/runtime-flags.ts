export function isPadPilotDevtoolsEnabled() {
  if (process.env.PADPILOT_DEVTOOLS_ENABLED === "true") {
    return true;
  }
  return false;
}
