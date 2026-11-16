import { afterEach, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { DiagnosticsModal, formatPeakValue, formatTimingValue, getActiveDiagnosticChains, getDiagnosticsStatusLabel, isDiagnosticsTimingEnabled } from "./diagnostics-modal";

createUiTest("DiagnosticsModal", () => {
  const originalDevtoolsFlag = process.env.PADPILOT_DEVTOOLS_ENABLED;

  afterEach(() => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = originalDevtoolsFlag;
  });

  it("formats diagnostic helpers through public functions", () => {
    const runtime = { profilingEnabled: true, profiledBlocks: 8, chains: [{ active: true, chainId: 1 }] };
    expect(isDiagnosticsTimingEnabled(runtime)).toBe(true);
    expect(getDiagnosticsStatusLabel(runtime)).toBe("Profiling On");
    expect(getActiveDiagnosticChains(runtime)).toHaveLength(1);
    expect(formatTimingValue(12.34, runtime)).toBe("12.34 us");
    expect(formatPeakValue(-6.5)).toBe("-6.50 dB");
  });

  it("opens and closes through the public launcher and modal shell", () => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = "true";
    render(() => <DiagnosticsModal />);

    fireEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    expect(screen.getByRole("dialog", { name: "PadPilot Diagnostics" })).not.toBeNull();
    expect(screen.getByText("UI Audio Cmd Dropped")).not.toBeNull();
    expect(screen.getByText("Audio Cmd Rejected")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog", { name: "PadPilot Diagnostics" })).toBeNull();
  });

  it("does not render the launcher when devtools are disabled", () => {
    process.env.PADPILOT_DEVTOOLS_ENABLED = "false";

    render(() => <DiagnosticsModal />);

    expect(screen.queryByRole("button", { name: "Diagnostics" })).toBeNull();
  });
});
