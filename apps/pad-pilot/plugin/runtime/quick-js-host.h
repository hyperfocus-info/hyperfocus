#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <optional>
#include <string>

extern "C" {
#include <quickjs.h>
}

#include "runtime/runtime-types.h"
#include "runtime/script-module-authorization.h"

namespace padpilot {

class QuickJSHost {
 public:
  QuickJSHost();
  ~QuickJSHost();

  void reset();
  bool loadModule(const std::string& bundledModulePath,
                  const std::string& expectedApiVersion,
                  const ScriptModuleAuthorization& authorization);
  std::optional<ScriptAction> dispatchInputEvent(const InputEvent& event);
  std::optional<std::string> upgradeModuleState(const std::string& stateJson,
                                                std::uint32_t fromSchemaVersion,
                                                std::uint32_t toSchemaVersion);
  void collectGarbage() noexcept;

 private:
  bool runHealthCheck();
  bool validateModuleApiVersion(const std::string& expectedApiVersion);
  JSValue evalWithBudget(const std::string& source,
                         const std::string& sourceName,
                         std::chrono::milliseconds budget);
  static int shouldInterrupt(JSRuntime* runtime, void* opaque) noexcept;
  std::optional<ScriptAction> parseActionObject(JSValueConst value);
  bool allowsCapability(ScriptCapability capability, const char* capabilityName);
  std::optional<AudioCommandType> parseAudioCommandType(const std::string& commandName) const;
  std::optional<std::string> jsValueToUtf8(JSValueConst value, std::size_t maximumBytes);
  static std::string readFileToString(const std::string& bundledModulePath);
  bool reportExceptionAndClear();

  JSRuntime* runtime_ {nullptr};
  JSContext* context_ {nullptr};
  JSValue onInputFunction_ {JS_UNDEFINED};
  ScriptModuleAuthorization authorization_;
  std::uint8_t deniedCapabilityLogMask_ {};
  std::atomic<std::int64_t> executionDeadlineNs_ {0};
  std::atomic<bool> executionTimedOut_ {false};
};

}  // namespace padpilot

