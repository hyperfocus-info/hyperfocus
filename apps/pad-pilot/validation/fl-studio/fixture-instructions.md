# FL Studio Host Fixtures

PadPilot release acceptance targets FL Studio 2026 first and FL Studio 21 as compatibility floor. These projects must be created independently because an FL Studio 2026 project is not a reliable FL Studio 21 fixture.

## Prepare

1. Run `bun run build:release:copy` so default VST3 location contains current Release PadPilot.
2. Run `bun run prepare:fl-studio-validation`. This creates deterministic `padpilot-host-input.wav` (one second, stereo, 48 kHz, 32-bit float, peak `-18 dBFS`) plus tested Unity and Controls protobuf Preset/code pairs.
3. In each FL version, use Plugin Manager with **Verify plugins** and **Rescan previously verified plugins** enabled. Confirm PadPilot is classified as an effect.
4. Open **Options > Audio settings** and set **Sample rate** to `48000 Hz`; do this separately in both FL versions. Remove the Master limiter and every other Mixer effect. Keep source, insert, send, and Master gains at unity. Disable unintended parallel Mixer routes.

## Unity projects

Create `padpilot-unity-fl26.flp` in FL Studio 2026 and `padpilot-unity-fl21.flp` in FL Studio 21.

1. Start from a new empty project. Place exactly one copy of `padpilot-host-input.wav` at Playlist time zero and end the project at exactly one second. Do not derive the Unity project from the four-clip Controls project.
2. Route clip to one Mixer insert containing PadPilot.
3. Select FX Module. Click **Set state from preset code** beside **Chain Presets**, paste the complete line from `fl-validation-unity.preset-code.txt`, and choose **Apply State**. Before saving, confirm exactly eight active empty chains, master input/output `0 dB`, master wet/dry `100%`, and no selected factory Preset such as `factory-cinematic`.
4. Save. Exit FL completely. Reopen once and confirm eight chains plus master values restored.

Expected render: duration one second; stereo 48 kHz; peak and RMS within `0.01 dB` of source; aligned samples within `1e-5` absolute error so polarity or channel corruption cannot hide behind matching levels.

## Control/state projects

Create `padpilot-controls-fl26.flp` in FL Studio 2026 and `padpilot-controls-fl21.flp` in FL Studio 21.

1. Place four contiguous copies of `padpilot-host-input.wav`; project duration exactly four seconds.
2. Route through one PadPilot instance. Select FX Module. Apply the complete line from `fl-validation-controls.preset-code.txt` through **Set state from preset code**. Before saving, confirm exactly one fully wet EQ node with a bell at `997 Hz`, `+12 dB`, `Q 1.1`, master input/output `0 dB`, and no selected factory Preset such as `factory-cinematic`.
3. Expose the existing PadPilot **Master Wet/Dry** host parameter to FL automation. The resulting automation target must identify **Master Wet/Dry**; an automation clip named `PadPilot - Mix level` controls the FL wrapper slot mix and is invalid for this fixture.
4. Use hold/step automation, never ramps:
   - `0-1 s`: `0%`.
   - `1-2 s`: `100%`.
   - `2-3 s`: `0%`.
   - `3-4 s`: `100%`.
5. Optionally use **Save New** to install the pasted state in the user Preset library. Save the project with the EQ state and wet/dry automation. Exit FL completely. Reopen once; inspect state with editor closed and open.

Expected render: both dry segments match source within `0.01 dB` and `1e-5` aligned sample error; wet changes level by at least `0.5 dB` without clipping; final wet matches first wet within `0.01 dB` and `2e-5` aligned sample error.

Rack mute is deliberately not part of this offline automation project: PadPilot does not advertise chain mute as a host automation target. Native graph tests cover realtime mute and the release smoke matrix covers the actual FL editor interaction.

## Run

Close every FL Studio process, then run:

```text
bun run validate:fl-studio
```

Runner launches FL Studio 2026 `26.1.1.5547` and FL Studio 21 `21.2.3.4004` as fresh processes, renders both projects through official diagnostic CLI mode, validates metrics, compares versions within `0.05 dB`, and writes immutable run artifacts under `build/fl-studio-validation/`.

Do not accept a new baseline from a failing render. Fix routing/state or update this contract deliberately with native evidence.
