import { expect, it } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { Meter, resolveMeterPresentation } from "./meter";

createUiTest("Meter", () => {
  it("resolves mono and stereo presentation through the public helper", () => {
    expect(resolveMeterPresentation({ label: "Out", stereo: false, valueDb: -12 }).readout).toBe("-12.0 dB");
    const stereo = resolveMeterPresentation({ label: "Out", leftValueDb: -4, rightValueDb: -3, stereo: true, valueDb: -4 });
    expect(stereo.stereoEnabled).toBe(true);
    expect(stereo.channels).toHaveLength(2);
  });

  it("renders readout, label, and stereo channel markers", () => {
    render(() => <Meter label="Output" valueDb={-6} leftValueDb={-5} rightValueDb={-7} stereo />);

    expect(screen.getByText("Output")).not.toBeNull();
    expect(screen.getByText("L -5.0 / R -7.0 dB")).not.toBeNull();
    expect(document.querySelector('[data-channel="left"]')).not.toBeNull();
    expect(document.querySelector('[data-channel="right"]')).not.toBeNull();
  });
});
