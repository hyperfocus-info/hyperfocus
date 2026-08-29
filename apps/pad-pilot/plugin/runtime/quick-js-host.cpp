#include "runtime/quick-js-host.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <limits>

#include <juce_core/juce_core.h>

#include "runtime/backend-log.h"
#include "runtime/module-manifest-limits.h"
#include "runtime/state-wire-limits.h"

namespace padpilot {

namespace {
using namespace std::chrono_literals;

constexpr std::size_t kQuickJsMemoryLimitBytes = 32ULL * 1024ULL * 1024ULL;
constexpr std::size_t kQuickJsStackLimitBytes = 1ULL * 1024ULL * 1024ULL;
constexpr std::size_t kMaxModuleSourceBytes = 4ULL * 1024ULL * 1024ULL;
constexpr std::size_t kMaxActionTypeBytes = 32;
constexpr std::size_t kMaxAudioCommandNameBytes = 64;
constexpr std::size_t kMaxModuleApiVersionBytes = module_manifest_limits::kMaximumApiVersionBytes;
constexpr std::size_t kMaxModuleStateBytes = state_wire_limits::kMaximumModuleStateBytes;
constexpr std::size_t kMaxAudioCommandTextBytes = kMaxPathChars - 1;
constexpr auto kModuleExecutionBudget = 500ms;
constexpr auto kInputExecutionBudget = 10ms;
constexpr auto kStateMigrationStepBudget = 50ms;

std::int64_t steadyClockNowNs() noexcept {
  return std::chrono::duration_cast<std::chrono::nanoseconds>(
             std::chrono::steady_clock::now().time_since_epoch())
      .count();
}

class ExecutionBudgetGuard {
 public:
  ExecutionBudgetGuard(std::atomic<std::int64_t>& deadline,
                       std::atomic<bool>& timedOut,
                       std::chrono::milliseconds budget) noexcept
      : deadline_(deadline) {
    timedOut.store(false, std::memory_order_relaxed);
    deadline_.store(
        steadyClockNowNs() + std::chrono::duration_cast<std::chrono::nanoseconds>(budget).count(),
        std::memory_order_release);
  }

  ~ExecutionBudgetGuard() {
    deadline_.store(0, std::memory_order_release);
  }

 private:
  std::atomic<std::int64_t>& deadline_;
};

void destroyQuickJsState(JSRuntime*& runtime, JSContext*& context, JSValue& onInputFunction) {
  if (context != nullptr) {
    JS_FreeValue(context, onInputFunction);
    onInputFunction = JS_UNDEFINED;
    JS_FreeContext(context);
    context = nullptr;
  }

  if (runtime != nullptr) {
    JS_FreeRuntime(runtime);
    runtime = nullptr;
  }
}
}  // namespace

QuickJSHost::QuickJSHost() {
  reset();
}

QuickJSHost::~QuickJSHost() {
  destroyQuickJsState(runtime_, context_, onInputFunction_);
}

void QuickJSHost::reset() {
  destroyQuickJsState(runtime_, context_, onInputFunction_);
  authorization_ = {};
  deniedCapabilityLogMask_ = 0;
  executionDeadlineNs_.store(0, std::memory_order_release);
  executionTimedOut_.store(false, std::memory_order_release);

  runtime_ = JS_NewRuntime();
  if (runtime_ != nullptr) {
    JS_SetMemoryLimit(runtime_, kQuickJsMemoryLimitBytes);
    JS_SetMaxStackSize(runtime_, kQuickJsStackLimitBytes);
    JS_SetCanBlock(runtime_, false);
    JS_SetInterruptHandler(runtime_, &QuickJSHost::shouldInterrupt, this);
    context_ = JS_NewContext(runtime_);
  }

  if (runtime_ == nullptr || context_ == nullptr) {
    appendBackendLog("quick-js-host", "QuickJS runtime initialization failed");
  }
}

bool QuickJSHost::loadModule(const std::string& bundledModulePath,
                             const std::string& expectedApiVersion,
                             const ScriptModuleAuthorization& authorization) {
  authorization_ = {};
  deniedCapabilityLogMask_ = 0;
  if (context_ == nullptr || !isValidScriptModuleAuthorization(authorization)) {
    appendBackendLog("quick-js-host", "Rejected module load without an authenticated module identity");
    return false;
  }

  const std::string source = readFileToString(bundledModulePath);
  if (source.empty()) {
    appendBackendLog("quick-js-host", "Module source could not be read or exceeded the source cap path=" + bundledModulePath);
    return false;
  }

  JSValue evalResult = evalWithBudget(source, bundledModulePath, kModuleExecutionBudget);
  if (JS_IsException(evalResult)) {
    JS_FreeValue(context_, evalResult);
    return reportExceptionAndClear();
  }
  JS_FreeValue(context_, evalResult);

  if (!runHealthCheck() || !validateModuleApiVersion(expectedApiVersion)) {
    return false;
  }

  JS_UpdateStackTop(runtime_);
  const ExecutionBudgetGuard budgetGuard(executionDeadlineNs_, executionTimedOut_, kModuleExecutionBudget);
  JSValue globalObject = JS_GetGlobalObject(context_);
  JSValue onInput = JS_GetPropertyStr(context_, globalObject, "padpilotOnInput");
  JS_FreeValue(context_, globalObject);

  if (JS_IsException(onInput)) {
    JS_FreeValue(context_, onInput);
    return reportExceptionAndClear();
  }

  if (!JS_IsFunction(context_, onInput)) {
    JS_FreeValue(context_, onInput);
    return false;
  }

  JS_FreeValue(context_, onInputFunction_);
  onInputFunction_ = JS_DupValue(context_, onInput);
  JS_FreeValue(context_, onInput);
  authorization_ = authorization;
  appendBackendLog("quick-js-host", "Loaded script module id=" + authorization_.moduleId);
  return true;
}

std::optional<ScriptAction> QuickJSHost::dispatchInputEvent(const InputEvent& event) {
  if (event.type == InputEventType::controlStreamReset || context_ == nullptr ||
      !JS_IsFunction(context_, onInputFunction_)) {
    return std::nullopt;
  }

  JS_UpdateStackTop(runtime_);
  const ExecutionBudgetGuard budgetGuard(executionDeadlineNs_, executionTimedOut_, kInputExecutionBudget);

  JSValue eventObject = JS_NewObject(context_);
  if (JS_IsException(eventObject)) {
    JS_FreeValue(context_, eventObject);
    reportExceptionAndClear();
    return std::nullopt;
  }

  JS_SetPropertyStr(context_, eventObject, "type",
                    JS_NewString(context_, event.type == InputEventType::button ? "button" : "axis"));
  JS_SetPropertyStr(context_, eventObject, "controlId", JS_NewInt32(context_, static_cast<int32_t>(event.controlId)));
  JS_SetPropertyStr(context_, eventObject, "deviceSlot", JS_NewInt32(context_, static_cast<int32_t>(event.deviceSlot)));
  JS_SetPropertyStr(context_, eventObject, "mappedType",
                    JS_NewString(context_, event.mappedType == InputEventType::button ? "button" : "axis"));
  JS_SetPropertyStr(context_, eventObject, "mappedControlId", JS_NewInt32(context_, static_cast<int32_t>(event.mappedControlId)));
  JS_SetPropertyStr(context_, eventObject, "mappedControlActive", JS_NewBool(context_, event.mappedControlActive));
  JS_SetPropertyStr(context_, eventObject, "value", JS_NewFloat64(context_, static_cast<double>(event.value)));
  JS_SetPropertyStr(context_, eventObject, "frameIndex",
                    JS_NewInt64(context_, static_cast<int64_t>(event.frameIndex)));

  JSValue globalObject = JS_GetGlobalObject(context_);
  JSValue argv[] = {eventObject};
  JSValue result = JS_Call(context_, onInputFunction_, globalObject, 1, argv);
  JS_FreeValue(context_, globalObject);
  JS_FreeValue(context_, eventObject);

  if (JS_IsException(result)) {
    JS_FreeValue(context_, result);
    reportExceptionAndClear();
    return std::nullopt;
  }

  const auto parsed = parseActionObject(result);
  JS_FreeValue(context_, result);
  return parsed;
}

std::optional<std::string> QuickJSHost::upgradeModuleState(
    const std::string& stateJson,
    const std::uint32_t fromSchemaVersion,
    const std::uint32_t toSchemaVersion) {
  if (context_ == nullptr || stateJson.empty() || stateJson.size() > kMaxModuleStateBytes ||
      fromSchemaVersion == 0 || toSchemaVersion <= fromSchemaVersion ||
      toSchemaVersion - fromSchemaVersion > module_manifest_limits::kMaximumStateMigrationSteps) {
    return std::nullopt;
  }

  JS_UpdateStackTop(runtime_);
  JSValue globalObject = JS_GetGlobalObject(context_);
  JSValue upgradeFunction = JS_UNDEFINED;
  {
    // Module globals may expose accessor properties. Keep discovery under the
    // same execution boundary as the migration callback itself so a hostile
    // getter cannot strand the Script Thread during teardown.
    const ExecutionBudgetGuard budgetGuard(
        executionDeadlineNs_, executionTimedOut_, kStateMigrationStepBudget);
    upgradeFunction = JS_GetPropertyStr(context_, globalObject, "onUpgradeState");
    if (!JS_IsException(upgradeFunction) && !JS_IsFunction(context_, upgradeFunction)) {
      JS_FreeValue(context_, upgradeFunction);
      upgradeFunction = JS_GetPropertyStr(context_, globalObject, "padpilotOnUpgradeState");
    }
  }
  if (JS_IsException(upgradeFunction)) {
    JS_FreeValue(context_, upgradeFunction);
    JS_FreeValue(context_, globalObject);
    reportExceptionAndClear();
    return std::nullopt;
  }
  if (!JS_IsFunction(context_, upgradeFunction)) {
    JS_FreeValue(context_, upgradeFunction);
    JS_FreeValue(context_, globalObject);
    appendBackendLog("quick-js-host", "State migration requires onUpgradeState");
    return std::nullopt;
  }

  JSValue currentState = JS_ParseJSON(
      context_, stateJson.c_str(), stateJson.size(), "<padpilot-module-state>");
  if (JS_IsException(currentState) || JS_IsNull(currentState) || !JS_IsObject(currentState)) {
    const auto raisedException = JS_IsException(currentState);
    JS_FreeValue(context_, currentState);
    JS_FreeValue(context_, upgradeFunction);
    JS_FreeValue(context_, globalObject);
    if (raisedException) {
      reportExceptionAndClear();
    }
    return std::nullopt;
  }

  std::optional<std::string> serializedState;
  for (auto version = fromSchemaVersion; version < toSchemaVersion; ++version) {
    const ExecutionBudgetGuard budgetGuard(
        executionDeadlineNs_, executionTimedOut_, kStateMigrationStepBudget);
    JSValue arguments[] = {
        currentState,
        JS_NewUint32(context_, version),
        JS_NewUint32(context_, version + 1U),
    };
    JSValue migratedState = JS_Call(context_, upgradeFunction, globalObject, 3, arguments);
    JS_FreeValue(context_, arguments[1]);
    JS_FreeValue(context_, arguments[2]);
    if (JS_IsException(migratedState) || JS_IsNull(migratedState) || !JS_IsObject(migratedState)) {
      const auto raisedException = JS_IsException(migratedState);
      JS_FreeValue(context_, migratedState);
      JS_FreeValue(context_, currentState);
      JS_FreeValue(context_, upgradeFunction);
      JS_FreeValue(context_, globalObject);
      if (raisedException) {
        reportExceptionAndClear();
      }
      return std::nullopt;
    }

    JSValue json = JS_JSONStringify(context_, migratedState, JS_UNDEFINED, JS_UNDEFINED);
    JS_FreeValue(context_, migratedState);
    if (JS_IsException(json)) {
      JS_FreeValue(context_, json);
      JS_FreeValue(context_, currentState);
      JS_FreeValue(context_, upgradeFunction);
      JS_FreeValue(context_, globalObject);
      reportExceptionAndClear();
      return std::nullopt;
    }
    serializedState = jsValueToUtf8(json, kMaxModuleStateBytes);
    JS_FreeValue(context_, json);
    if (!serializedState.has_value() || serializedState->empty()) {
      JS_FreeValue(context_, currentState);
      JS_FreeValue(context_, upgradeFunction);
      JS_FreeValue(context_, globalObject);
      return std::nullopt;
    }

    JS_FreeValue(context_, currentState);
    currentState = JS_ParseJSON(
        context_, serializedState->c_str(), serializedState->size(), "<padpilot-migrated-state>");
    if (JS_IsException(currentState) || JS_IsNull(currentState) || !JS_IsObject(currentState)) {
      const auto raisedException = JS_IsException(currentState);
      JS_FreeValue(context_, currentState);
      JS_FreeValue(context_, upgradeFunction);
      JS_FreeValue(context_, globalObject);
      if (raisedException) {
        reportExceptionAndClear();
      }
      return std::nullopt;
    }
  }

  JS_FreeValue(context_, currentState);
  JS_FreeValue(context_, upgradeFunction);
  JS_FreeValue(context_, globalObject);
  return serializedState;
}

void QuickJSHost::collectGarbage() noexcept {
  if (runtime_ != nullptr && executionDeadlineNs_.load(std::memory_order_acquire) == 0) {
    JS_RunGC(runtime_);
  }
}

bool QuickJSHost::runHealthCheck() {
  JS_UpdateStackTop(runtime_);
  const ExecutionBudgetGuard budgetGuard(executionDeadlineNs_, executionTimedOut_, kModuleExecutionBudget);
  JSValue globalObject = JS_GetGlobalObject(context_);
  JSValue functionValue = JS_GetPropertyStr(context_, globalObject, "padpilotHealthCheck");
  if (JS_IsException(functionValue)) {
    JS_FreeValue(context_, functionValue);
    JS_FreeValue(context_, globalObject);
    return reportExceptionAndClear();
  }

  if (!JS_IsFunction(context_, functionValue)) {
    JS_FreeValue(context_, functionValue);
    JS_FreeValue(context_, globalObject);
    return false;
  }

  JSValue result = JS_Call(context_, functionValue, globalObject, 0, nullptr);
  JS_FreeValue(context_, functionValue);
  JS_FreeValue(context_, globalObject);

  if (JS_IsException(result)) {
    JS_FreeValue(context_, result);
    return reportExceptionAndClear();
  }

  const int boolValue = JS_IsBool(result) ? JS_ToBool(context_, result) : -1;
  JS_FreeValue(context_, result);
  return boolValue == 1;
}

bool QuickJSHost::validateModuleApiVersion(const std::string& expectedApiVersion) {
  if (expectedApiVersion.empty() || expectedApiVersion.size() > kMaxModuleApiVersionBytes) {
    return false;
  }
  JS_UpdateStackTop(runtime_);
  const ExecutionBudgetGuard budgetGuard(executionDeadlineNs_, executionTimedOut_, kModuleExecutionBudget);
  JSValue globalObject = JS_GetGlobalObject(context_);
  JSValue getManifest = JS_GetPropertyStr(context_, globalObject, "padpilotGetModuleManifest");
  if (JS_IsException(getManifest)) {
    JS_FreeValue(context_, getManifest);
    JS_FreeValue(context_, globalObject);
    return reportExceptionAndClear();
  }

  if (!JS_IsFunction(context_, getManifest)) {
    JS_FreeValue(context_, getManifest);
    JS_FreeValue(context_, globalObject);
    return false;
  }

  JSValue manifest = JS_Call(context_, getManifest, globalObject, 0, nullptr);
  JS_FreeValue(context_, getManifest);
  JS_FreeValue(context_, globalObject);
  if (JS_IsException(manifest)) {
    JS_FreeValue(context_, manifest);
    return reportExceptionAndClear();
  }

  JSValue moduleApiVersion = JS_GetPropertyStr(context_, manifest, "moduleApiVersion");
  JS_FreeValue(context_, manifest);
  if (JS_IsException(moduleApiVersion)) {
    JS_FreeValue(context_, moduleApiVersion);
    return reportExceptionAndClear();
  }

  const auto version = JS_IsString(moduleApiVersion)
                           ? jsValueToUtf8(moduleApiVersion, kMaxModuleApiVersionBytes)
                           : std::optional<std::string> {};
  JS_FreeValue(context_, moduleApiVersion);
  return version.has_value() && version.value() == expectedApiVersion;
}

JSValue QuickJSHost::evalWithBudget(const std::string& source,
                                    const std::string& sourceName,
                                    std::chrono::milliseconds budget) {
  JS_UpdateStackTop(runtime_);
  const ExecutionBudgetGuard budgetGuard(executionDeadlineNs_, executionTimedOut_, budget);
  return JS_Eval(context_, source.c_str(), source.size(), sourceName.c_str(), JS_EVAL_TYPE_GLOBAL);
}

int QuickJSHost::shouldInterrupt(JSRuntime*, void* opaque) noexcept {
  auto* host = static_cast<QuickJSHost*>(opaque);
  if (host == nullptr) {
    return 0;
  }

  const auto deadline = host->executionDeadlineNs_.load(std::memory_order_acquire);
  if (deadline == 0 || steadyClockNowNs() < deadline) {
    return 0;
  }

  host->executionTimedOut_.store(true, std::memory_order_release);
  return 1;
}

std::optional<ScriptAction> QuickJSHost::parseActionObject(JSValueConst value) {
  if (JS_IsUndefined(value) || JS_IsNull(value) || !JS_IsObject(value)) {
    return std::nullopt;
  }

  JSValue typeValue = JS_GetPropertyStr(context_, value, "type");
  if (JS_IsException(typeValue)) {
    JS_FreeValue(context_, typeValue);
    reportExceptionAndClear();
    return std::nullopt;
  }

  const auto actionType = JS_IsString(typeValue)
                              ? jsValueToUtf8(typeValue, kMaxActionTypeBytes)
                              : std::optional<std::string> {};
  JS_FreeValue(context_, typeValue);
  if (actionType.has_value() && actionType.value() == "keystroke") {
    if (!allowsCapability(ScriptCapability::keyboardOutput, "keyboard-output")) {
      return std::nullopt;
    }
    JSValue keyCodeValue = JS_GetPropertyStr(context_, value, "keyCode");
    JSValue isKeyDownValue = JS_GetPropertyStr(context_, value, "isKeyDown");
    if (JS_IsException(keyCodeValue) || JS_IsException(isKeyDownValue)) {
      JS_FreeValue(context_, keyCodeValue);
      JS_FreeValue(context_, isKeyDownValue);
      reportExceptionAndClear();
      return std::nullopt;
    }

    double keyCode = 0.0;
    int isKeyDown = 0;
    const bool keyCodeOk = JS_IsNumber(keyCodeValue) &&
                           JS_ToFloat64(context_, &keyCode, keyCodeValue) == 0 &&
                           std::isfinite(keyCode) && keyCode >= 0.0 &&
                           keyCode <= static_cast<double>(std::numeric_limits<std::uint8_t>::max()) &&
                           std::trunc(keyCode) == keyCode;
    const bool isKeyDownOk = JS_IsBool(isKeyDownValue) &&
                             (isKeyDown = JS_ToBool(context_, isKeyDownValue)) >= 0;
    JS_FreeValue(context_, keyCodeValue);
    JS_FreeValue(context_, isKeyDownValue);

    if (!keyCodeOk || !isKeyDownOk) {
      return std::nullopt;
    }

    ScriptAction action {};
    action.type = ScriptActionType::keystroke;
    action.keyCode = static_cast<std::uint16_t>(keyCode);
    action.isKeyDown = isKeyDown == 1;
    return action;
  }

  if (actionType.has_value() && actionType.value() == "audioCommand") {
    if (!allowsCapability(ScriptCapability::fxGraph, "fx-graph")) {
      return std::nullopt;
    }
    JSValue commandNameValue = JS_GetPropertyStr(context_, value, "command");
    JSValue valueA = JS_GetPropertyStr(context_, value, "value");
    JSValue valueB = JS_GetPropertyStr(context_, value, "valueB");
    JSValue boolValue = JS_GetPropertyStr(context_, value, "boolValue");
    JSValue textValue = JS_GetPropertyStr(context_, value, "text");
    JSValue parameterIdValue = JS_GetPropertyStr(context_, value, "parameterId");

    if (JS_IsException(commandNameValue) || JS_IsException(valueA) || JS_IsException(valueB) ||
        JS_IsException(boolValue) || JS_IsException(textValue) || JS_IsException(parameterIdValue)) {
      JS_FreeValue(context_, commandNameValue);
      JS_FreeValue(context_, valueA);
      JS_FreeValue(context_, valueB);
      JS_FreeValue(context_, boolValue);
      JS_FreeValue(context_, textValue);
      JS_FreeValue(context_, parameterIdValue);
      reportExceptionAndClear();
      return std::nullopt;
    }

    const auto commandName = JS_IsString(commandNameValue)
                                 ? jsValueToUtf8(commandNameValue, kMaxAudioCommandNameBytes)
                                 : std::optional<std::string> {};
    JS_FreeValue(context_, commandNameValue);
    if (!commandName.has_value()) {
      JS_FreeValue(context_, valueA);
      JS_FreeValue(context_, valueB);
      JS_FreeValue(context_, boolValue);
      JS_FreeValue(context_, textValue);
      JS_FreeValue(context_, parameterIdValue);
      return std::nullopt;
    }

    const auto commandType = parseAudioCommandType(commandName.value());
    if (!commandType.has_value()) {
      JS_FreeValue(context_, valueA);
      JS_FreeValue(context_, valueB);
      JS_FreeValue(context_, boolValue);
      JS_FreeValue(context_, textValue);
      JS_FreeValue(context_, parameterIdValue);
      return std::nullopt;
    }

    double commandValueA = 0.0;
    double commandValueB = 0.0;
    double commandParameterId = 0.0;
    int commandBoolValue = 0;
    const auto parseOptionalFiniteNumber = [this](JSValueConst field, double& destination) {
      if (JS_IsUndefined(field) || JS_IsNull(field)) {
        return true;
      }
      return JS_IsNumber(field) && JS_ToFloat64(context_, &destination, field) == 0 &&
             std::isfinite(destination) &&
             std::abs(destination) <= static_cast<double>(std::numeric_limits<float>::max());
    };
    const bool valueAOk = parseOptionalFiniteNumber(valueA, commandValueA);
    const bool valueBOk = parseOptionalFiniteNumber(valueB, commandValueB);
    const bool boolValueOk = JS_IsUndefined(boolValue) || JS_IsNull(boolValue) || JS_IsBool(boolValue);
    if (boolValueOk && !JS_IsUndefined(boolValue) && !JS_IsNull(boolValue)) {
      commandBoolValue = JS_ToBool(context_, boolValue);
    }
    const bool parameterIdOk = parseOptionalFiniteNumber(parameterIdValue, commandParameterId) &&
                               commandParameterId >= 0.0 &&
                               commandParameterId <= static_cast<double>(std::numeric_limits<std::uint32_t>::max()) &&
                               std::trunc(commandParameterId) == commandParameterId;

    if (!valueAOk || !valueBOk || !boolValueOk || commandBoolValue < 0 || !parameterIdOk) {
      JS_FreeValue(context_, valueA);
      JS_FreeValue(context_, valueB);
      JS_FreeValue(context_, boolValue);
      JS_FreeValue(context_, textValue);
      JS_FreeValue(context_, parameterIdValue);
      appendBackendLog("quick-js-host", "Rejected malformed audio command fields");
      return std::nullopt;
    }

    std::string text;
    if (!JS_IsUndefined(textValue) && !JS_IsNull(textValue)) {
      if (!JS_IsString(textValue)) {
        JS_FreeValue(context_, valueA);
        JS_FreeValue(context_, valueB);
        JS_FreeValue(context_, boolValue);
        JS_FreeValue(context_, textValue);
        JS_FreeValue(context_, parameterIdValue);
        appendBackendLog("quick-js-host", "Rejected non-string audio command text");
        return std::nullopt;
      }
      const auto maybeText = jsValueToUtf8(textValue, kMaxAudioCommandTextBytes);
      if (!maybeText.has_value()) {
        JS_FreeValue(context_, valueA);
        JS_FreeValue(context_, valueB);
        JS_FreeValue(context_, boolValue);
        JS_FreeValue(context_, textValue);
        JS_FreeValue(context_, parameterIdValue);
        return std::nullopt;
      }
      text = maybeText.value();
    }

    JS_FreeValue(context_, valueA);
    JS_FreeValue(context_, valueB);
    JS_FreeValue(context_, boolValue);
    JS_FreeValue(context_, textValue);
    JS_FreeValue(context_, parameterIdValue);

    ScriptAction action {};
    action.type = ScriptActionType::audioCommand;
    action.audioCommand.type = commandType.value();
    action.audioCommand.parameterId = static_cast<std::uint32_t>(commandParameterId);
    action.audioCommand.value = static_cast<float>(commandValueA);
    action.audioCommand.valueB = static_cast<float>(commandValueB);
    action.audioCommand.boolValue = commandBoolValue == 1;
    if (!text.empty()) {
      std::memcpy(action.audioCommand.text, text.data(), text.size());
      action.audioCommand.text[text.size()] = '\0';
    }
    return action;
  }

  return std::nullopt;
}

bool QuickJSHost::allowsCapability(ScriptCapability capability, const char* capabilityName) {
  if (authorization_.allows(capability)) {
    return true;
  }

  const auto capabilityBit = static_cast<std::uint8_t>(capability);
  if ((deniedCapabilityLogMask_ & capabilityBit) == 0) {
    deniedCapabilityLogMask_ |= capabilityBit;
    appendBackendLog(
        "quick-js-host",
        "Rejected undeclared capability=" + std::string(capabilityName) +
            " module=" + (authorization_.moduleId.empty() ? std::string("<unauthenticated>")
                                                           : authorization_.moduleId));
  }
  return false;
}

std::optional<AudioCommandType> QuickJSHost::parseAudioCommandType(const std::string& commandName) const {
  if (commandName == "setConvolverWetDry") return AudioCommandType::setConvolverWetDry;
  if (commandName == "setDelayWetDry") return AudioCommandType::setDelayWetDry;
  if (commandName == "setDelayTimeBeats") return AudioCommandType::setDelayTimeBeats;
  if (commandName == "setDelayTimeHz") return AudioCommandType::setDelayTimeHz;
  if (commandName == "setDelaySyncEnabled") return AudioCommandType::setDelaySyncEnabled;
  if (commandName == "setDelayFeedback") return AudioCommandType::setDelayFeedback;
  if (commandName == "setDelayLowCutHz") return AudioCommandType::setDelayLowCutHz;
  if (commandName == "setDelayHighCutHz") return AudioCommandType::setDelayHighCutHz;
  if (commandName == "setDelayWidth") return AudioCommandType::setDelayWidth;
  if (commandName == "setReverbWetDry") return AudioCommandType::setReverbWetDry;
  if (commandName == "setReverbPreDelayMs") return AudioCommandType::setReverbPreDelayMs;
  if (commandName == "setReverbDecaySeconds") return AudioCommandType::setReverbDecaySeconds;
  if (commandName == "setReverbSize") return AudioCommandType::setReverbSize;
  if (commandName == "setReverbDampening") return AudioCommandType::setReverbDampening;
  if (commandName == "setReverbWidth") return AudioCommandType::setReverbWidth;
  if (commandName == "setModulationRateHz") return AudioCommandType::setModulationRateHz;
  if (commandName == "setModulationDepth") return AudioCommandType::setModulationDepth;
  if (commandName == "setModulationFeedback") return AudioCommandType::setModulationFeedback;
  if (commandName == "setModulationMix") return AudioCommandType::setModulationMix;
  if (commandName == "setModulationStereoPhase") return AudioCommandType::setModulationStereoPhase;
  if (commandName == "setModulationMode") return AudioCommandType::setModulationMode;
  if (commandName == "setEqBandCount") return AudioCommandType::setEqBandCount;
  if (commandName == "setEqBandType") return AudioCommandType::setEqBandType;
  if (commandName == "setEqBandFrequency") return AudioCommandType::setEqBandFrequency;
  if (commandName == "setEqBandGainDb") return AudioCommandType::setEqBandGainDb;
  if (commandName == "setEqBandQ") return AudioCommandType::setEqBandQ;
  if (commandName == "setEqBandEnabled") return AudioCommandType::setEqBandEnabled;
  if (commandName == "setFxChainEnabled") return AudioCommandType::setFxChainEnabled;
  if (commandName == "setFxChainMix") return AudioCommandType::setFxChainMix;
  if (commandName == "setFxChainGainDb") return AudioCommandType::setFxChainGainDb;
  if (commandName == "setFxChainOrder") return AudioCommandType::setFxChainOrder;
  if (commandName == "setFxChainMuted") return AudioCommandType::setFxChainMuted;
  if (commandName == "setFxChainSolo") return AudioCommandType::setFxChainSolo;
  if (commandName == "setFxNodeBypassed") return AudioCommandType::setFxNodeBypassed;
  if (commandName == "setFxNodeMix") return AudioCommandType::setFxNodeMix;
  if (commandName == "setFxNodeParamFloat") return AudioCommandType::setFxNodeParamFloat;
  if (commandName == "setMasterInputGainDb") return AudioCommandType::setMasterInputGainDb;
  if (commandName == "setMasterWetDry") return AudioCommandType::setMasterWetDry;
  if (commandName == "setOutputGainDb") return AudioCommandType::setOutputGainDb;
  return std::nullopt;
}

std::optional<std::string> QuickJSHost::jsValueToUtf8(JSValueConst value,
                                                       std::size_t maximumBytes) {
  if (!JS_IsString(value)) {
    return std::nullopt;
  }

  JSValue lengthValue = JS_GetPropertyStr(context_, value, "length");
  std::int64_t codeUnitLength = 0;
  const bool lengthOk = !JS_IsException(lengthValue) && JS_IsNumber(lengthValue) &&
                        JS_ToInt64(context_, &codeUnitLength, lengthValue) == 0;
  JS_FreeValue(context_, lengthValue);
  if (!lengthOk) {
    reportExceptionAndClear();
    return std::nullopt;
  }
  if (codeUnitLength < 0 ||
      static_cast<std::uint64_t>(codeUnitLength) > static_cast<std::uint64_t>(maximumBytes)) {
    return std::nullopt;
  }

  std::size_t byteLength = 0;
  const char* cstr = JS_ToCStringLen(context_, &byteLength, value);
  if (cstr == nullptr) {
    reportExceptionAndClear();
    return std::nullopt;
  }

  if (byteLength > maximumBytes || std::memchr(cstr, '\0', byteLength) != nullptr) {
    JS_FreeCString(context_, cstr);
    return std::nullopt;
  }
  std::string text(cstr, byteLength);
  JS_FreeCString(context_, cstr);
  return text;
}

std::string QuickJSHost::readFileToString(const std::string& bundledModulePath) {
  const auto path = juce::String::fromUTF8(
      bundledModulePath.data(), static_cast<int>(bundledModulePath.size()));
  const juce::File sourceFile(path);
  if (!sourceFile.existsAsFile() || sourceFile.isSymbolicLink()) {
    return {};
  }
  juce::FileInputStream input {sourceFile};
  if (!input.openedOk()) {
    return {};
  }

  const auto sourceSize = input.getTotalLength();
  if (sourceSize <= 0 || sourceSize > static_cast<std::int64_t>(kMaxModuleSourceBytes)) {
    return {};
  }

  std::string source(static_cast<std::size_t>(sourceSize), '\0');
  if (input.read(source.data(), static_cast<int>(source.size())) != static_cast<int>(source.size()) ||
      !input.isExhausted()) {
    return {};
  }
  return source;
}

bool QuickJSHost::reportExceptionAndClear() {
  if (context_ == nullptr) {
    return false;
  }

  JSValue exception = JS_GetException(context_);
  JS_FreeValue(context_, exception);
  if (executionTimedOut_.exchange(false, std::memory_order_acq_rel)) {
    appendBackendLog("quick-js-host", "QuickJS execution exceeded its time budget");
  } else {
    appendBackendLog("quick-js-host", "QuickJS execution raised an exception");
  }
  return false;
}

}  // namespace padpilot




