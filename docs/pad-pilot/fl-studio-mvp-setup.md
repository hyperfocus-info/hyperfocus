# PadPilot MVP Setup (Windows + FL Studio)

## 1) Build the Module Bundle

From `modules/`:

- Install dependencies: `bun install`
- Build module bundle: `bun run build`

Expected output:

- `modules/dist/module.js`

## 2) QuickJS-NG Runtime (No External SDK)

PadPilot uses `FetchContent` to pull QuickJS-NG and links it statically into the plugin.

- No external JS SDK path is required.
- No JS runtime DLL needs to be installed or copied manually.

## 3) Configure and Build Plugin

From repo root:

- Configure:
  - `cmake -S . -B build -G "Visual Studio 17 2022" -A x64`
- Build:
  - `cmake --build build --config Release`

Expected artifact (JUCE default VST3 path may vary by generator):

- `PadPilot.vst3`

## 4) Point PadPilot to the Module Bundle

Set environment variable before launching FL Studio:

- `PADPILOT_MODULE_PATH=C:\\Users\\MindOverMelee\\pad-pilot\\modules\\dist\\module.js`

PadPilot loads this file in `prepareToPlay` and validates:

- `padpilotHealthCheck()`
- `padpilotGetModuleManifest().moduleApiVersion === "0.1.0"`
- presence of `padpilotOnInput(event)`

## 5) Import in FL Studio

- Place/copy `PadPilot.vst3` into your scanned VST3 path.
- In FL Studio, run plugin scan.
- Add PadPilot to a channel/effect slot.

## 6) Test Button Binding (MVP)

Current module example maps:

- SDL button `0` (Cross/South on most gamepads) -> virtual key `SPACE` (`0x20`)

Behavior:

- Button press sends `SPACE` key down
- Button release sends `SPACE` key up

In FL Studio, bind transport/play to spacebar and press the mapped button.

## 7) Change Bindings

Edit `modules/src/index.ts`:

- update `buttonBindings` map values (`controlId -> virtual key code`)
- rebuild module: `bun run build`

No C++ rebuild is required for binding-only changes.
