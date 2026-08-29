import { describe, expect, it } from "bun:test";
import { readProcessorSource } from "./processor-source-contract";

const functionBody = (source: string, signature: string) => {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unterminated function: ${signature}`);
};

describe("Module state migration lifecycle", () => {
  it("retains bounded manifest schema metadata without changing protobuf", async () => {
    const header = await Bun.file(new URL("./module-store.h", import.meta.url)).text();
    const store = await Bun.file(new URL("./module-store.cpp", import.meta.url)).text();
    const limits = await Bun.file(new URL("./module-manifest-limits.h", import.meta.url)).text();
    const proto = await Bun.file(new URL("../../utils/proto/bridge.proto", import.meta.url)).text();

    expect(header).toContain("std::uint32_t stateSchemaVersion {1}");
    expect(header).toContain("std::uint32_t expectedStateSchemaVersion {1}");
    expect(limits).toContain("kMaximumStateSchemaVersion = 64U");
    expect(store).toContain("module_manifest_limits::kMaximumStateSchemaVersion");
    expect(store).toContain("parseModuleStateSchemaVersion");
    expect(store).toContain('getChildFile("padpilot-module.json")');
    expect(proto).not.toContain("state_schema_version");
  });

  it("runs adjacent upgrades under per-step QuickJS watchdog and JSON bounds", async () => {
    const source = await Bun.file(new URL("./quick-js-host.cpp", import.meta.url)).text();
    const body = functionBody(source, "QuickJSHost::upgradeModuleState");

    expect(body).toContain('JS_GetPropertyStr(context_, globalObject, "onUpgradeState")');
    expect(body).toContain("version < toSchemaVersion; ++version");
    expect(body).toContain("version + 1U");
    expect(body).toContain("kStateMigrationStepBudget");
    expect(body).toContain("ExecutionBudgetGuard");
    expect(body).toContain("JS_JSONStringify");
    expect(body).toContain("kMaxModuleStateBytes");
    expect(body).toContain("!JS_IsObject");
  });

  it("dispatches migration on ScriptHost worker before input draining", async () => {
    const source = await Bun.file(new URL("./script-host.cpp", import.meta.url)).text();
    const run = functionBody(source, "void ScriptHost::run");
    const request = functionBody(source, "ScriptHost::migrateModuleState");

    expect(request).toContain("wakeSignal_.notify()");
    expect(request).toContain("stateMigrationCondition_.wait_for");
    expect(request).toContain("std::this_thread::get_id() == thread_.get_id()");
    expect(run.indexOf("processStateMigrationRequest()")).toBeLessThan(run.indexOf("inputQueue_.pop"));
  });

  it("commits atomically and preserves original state on every failure", async () => {
    const source = await readProcessorSource();
    const body = functionBody(source, "PadPilotAudioProcessor::migrateModuleStateAfterScriptLoad");

    expect(body).toContain("const auto originalPayload = *payload");
    expect(body).toContain("const auto isJsonObject");
    expect(body).toContain("isJsonObject(decodedPayload)");
    expect(body).toContain("else if (isJsonObject(originalPayload))");
    expect(body).toContain('current->loadStatus = "state-migration-failed"');
    expect(body).toContain("scriptHost_.revokeModuleAuthorization()");
    expect(body).toContain("existingState->second != originalPayload");
    expect(body.indexOf("scriptHost_.migrateModuleState")).toBeLessThan(
      body.indexOf("existingState->second = encoded"),
    );
    expect(body).toContain("existingState->second = originalPayload");
  });
});
