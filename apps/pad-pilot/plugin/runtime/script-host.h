#pragma once

#include <atomic>
#include <array>
#include <condition_variable>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "runtime/keystroke-sender.h"
#include "runtime/lock-free-queue.h"
#include "runtime/quick-js-host.h"
#include "runtime/runtime-types.h"
#include "runtime/script-module-authorization.h"
#include "runtime/wake-signal.h"

namespace padpilot {

inline constexpr const char* kModuleApiVersion = "0.1.0";

class ScriptHost {
 public:
  ScriptHost(LockFreeQueue<InputEvent, 2048>& inputQueue,
             LockFreeQueue<AudioCommand, 2048>& audioCommandQueue,
             WakeSignal& wakeSignal,
             std::atomic<std::uint64_t>& graphEpoch,
             const KeystrokeOutput* keystrokeOutput = nullptr);
  ~ScriptHost();

  void start();
  void stop();
  bool loadModule(const ScriptModuleLoadRequest& request);
  std::optional<std::string> migrateModuleState(const std::string& moduleId,
                                                const std::string& stateJson,
                                                std::uint32_t fromSchemaVersion,
                                                std::uint32_t toSchemaVersion);
  void revokeModuleAuthorization();
  bool enqueueActions(const std::string& moduleId, const std::vector<ScriptAction>& actions);
  std::uint64_t getWakeupCount() const noexcept;
  std::uint64_t getProcessedInputEvents() const noexcept;
  std::uint64_t getCommandsPushed() const noexcept;
  std::uint64_t getCommandsDropped() const noexcept;

 private:
  static constexpr std::size_t kMaxQueuedActionsPerBatch = 64;
  static constexpr std::uint64_t kInputEventsBetweenGarbageCollections = 2'048;

  struct QueuedActionBatch {
    std::uint16_t count {};
    std::uint64_t authorizationGeneration {};
    std::array<ScriptAction, kMaxQueuedActionsPerBatch> actions {};
  };

  struct StateMigrationRequest {
    std::string moduleId;
    std::string stateJson;
    std::optional<std::string> result;
    std::uint32_t fromSchemaVersion {};
    std::uint32_t toSchemaVersion {};
    bool pending {false};
    bool inProgress {false};
    bool completed {false};
    bool cancelled {false};
  };

  void run();
  void clearAuthorizationLocked();
  void releasePressedKeysLocked();
  bool isActionAuthorizedLocked(const ScriptAction& action);
  void logUnauthorizedActionLocked(ScriptCapability capability, const char* capabilityName);
  void processAction(const ScriptAction& action, std::uint64_t authorizationGeneration);
  void processInputEvent(const InputEvent& inputEvent);
  void processStateMigrationRequest();

  LockFreeQueue<InputEvent, 2048>& inputQueue_;
  LockFreeQueue<AudioCommand, 2048>& audioCommandQueue_;
  WakeSignal& wakeSignal_;
  std::atomic<std::uint64_t>& graphEpoch_;
  LockFreeQueue<QueuedActionBatch, 8> queuedActions_;
  KeystrokeSender keystrokeSender_;
  const KeystrokeOutput* keystrokeOutput_ {};
  std::array<bool, 256> pressedKeys_ {};
  QuickJSHost scriptEngine_;
  std::atomic<bool> running_ {false};
  std::atomic<bool> moduleLoaded_ {false};
  std::atomic<std::uint64_t> wakeupCount_ {0};
  std::atomic<std::uint64_t> processedInputEvents_ {0};
  std::atomic<std::uint64_t> commandsPushed_ {0};
  std::atomic<std::uint64_t> commandsDropped_ {0};
  std::mutex lifecycleMutex_;
  std::mutex queuedActionsMutex_;
  std::mutex moduleLoadMutex_;
  std::mutex authorizationMutex_;
  std::mutex stateMigrationMutex_;
  std::condition_variable stateMigrationCondition_;
  StateMigrationRequest stateMigrationRequest_;
  ScriptModuleAuthorization authorization_;
  std::uint64_t authorizationGeneration_ {};
  std::uint8_t deniedCapabilityLogMask_ {};
  std::uint64_t inputEventsSinceGarbageCollection_ {};
  std::thread thread_;
};

}  // namespace padpilot

