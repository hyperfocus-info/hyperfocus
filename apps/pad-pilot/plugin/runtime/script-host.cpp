#include "runtime/script-host.h"

#include <chrono>
#include <mutex>

#include "runtime/backend-log.h"

namespace padpilot {

ScriptHost::ScriptHost(LockFreeQueue<InputEvent, 2048>& inputQueue,
                       LockFreeQueue<AudioCommand, 2048>& audioCommandQueue,
                       WakeSignal& wakeSignal,
                       std::atomic<std::uint64_t>& graphEpoch,
                       const KeystrokeOutput* keystrokeOutput)
    : inputQueue_(inputQueue),
      audioCommandQueue_(audioCommandQueue),
      wakeSignal_(wakeSignal),
      graphEpoch_(graphEpoch),
      keystrokeOutput_(keystrokeOutput != nullptr ? keystrokeOutput : &keystrokeSender_) {}

ScriptHost::~ScriptHost() {
  stop();
}

void ScriptHost::start() {
  std::lock_guard<std::mutex> lifecycleGuard(lifecycleMutex_);
  std::lock_guard<std::mutex> guard(queuedActionsMutex_);
  bool expected = false;
  if (!running_.compare_exchange_strong(expected, true)) {
    return;
  }

  queuedActions_.drain();
  thread_ = std::thread([this] { run(); });
}

void ScriptHost::stop() {
  std::lock_guard<std::mutex> lifecycleGuard(lifecycleMutex_);
  bool shouldJoin = false;
  {
    std::lock_guard<std::mutex> guard(queuedActionsMutex_);
    bool expected = true;
    shouldJoin = running_.compare_exchange_strong(expected, false);
  }

  if (shouldJoin) {
    wakeSignal_.notify();
    if (thread_.joinable()) {
      thread_.join();
    }
  }
  {
    std::lock_guard<std::mutex> guard(queuedActionsMutex_);
    queuedActions_.drain();
  }
  revokeModuleAuthorization();
  stateMigrationCondition_.notify_all();
}

bool ScriptHost::loadModule(const ScriptModuleLoadRequest& request) {
  std::lock_guard<std::mutex> guard(moduleLoadMutex_);
  advanceGraphEpoch(graphEpoch_);
  moduleLoaded_.store(false, std::memory_order_release);
  {
    std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
    clearAuthorizationLocked();
  }
  scriptEngine_.reset();

  if (request.moduleId.empty()) {
    if (!request.bundledModulePath.empty() || !request.allowedCapabilities.empty()) {
      appendBackendLog("script-host", "Rejected script load request without an authenticated module identity");
      return false;
    }
    return true;
  }

  const auto authorization = authorizeScriptModule(request.moduleId, request.allowedCapabilities);
  if (!authorization.has_value()) {
    appendBackendLog("script-host", "Rejected invalid script module identity=" + request.moduleId);
    return false;
  }

  const bool hasScript = !request.bundledModulePath.empty();
  const bool loaded = !hasScript ||
                      scriptEngine_.loadModule(request.bundledModulePath, kModuleApiVersion, *authorization);
  if (loaded) {
    std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
    authorization_ = *authorization;
    deniedCapabilityLogMask_ = 0;
    ++authorizationGeneration_;
    if (authorizationGeneration_ == 0) {
      ++authorizationGeneration_;
    }
  }
  moduleLoaded_.store(loaded && hasScript, std::memory_order_release);
  if (loaded) {
    appendBackendLog("script-host", "Authorized script actions for module=" + authorization->moduleId);
  }
  return loaded;
}

std::optional<std::string> ScriptHost::migrateModuleState(
    const std::string& moduleId,
    const std::string& stateJson,
    const std::uint32_t fromSchemaVersion,
    const std::uint32_t toSchemaVersion) {
  using namespace std::chrono_literals;
  if (!running_.load(std::memory_order_acquire) || moduleId.empty() || stateJson.empty() ||
      fromSchemaVersion == 0 || toSchemaVersion <= fromSchemaVersion ||
      std::this_thread::get_id() == thread_.get_id()) {
    return std::nullopt;
  }

  std::unique_lock<std::mutex> guard(stateMigrationMutex_);
  if (stateMigrationRequest_.pending || stateMigrationRequest_.inProgress) {
    return std::nullopt;
  }
  stateMigrationRequest_ = {};
  stateMigrationRequest_.moduleId = moduleId;
  stateMigrationRequest_.stateJson = stateJson;
  stateMigrationRequest_.fromSchemaVersion = fromSchemaVersion;
  stateMigrationRequest_.toSchemaVersion = toSchemaVersion;
  stateMigrationRequest_.pending = true;
  wakeSignal_.notify();

  const auto completed = stateMigrationCondition_.wait_for(guard, 4s, [this] {
    return stateMigrationRequest_.completed || !running_.load(std::memory_order_acquire);
  });
  if (!completed || !stateMigrationRequest_.completed) {
    stateMigrationRequest_.cancelled = true;
    appendBackendLog("script-host", "State migration request timed out or runtime stopped");
    return std::nullopt;
  }
  auto result = std::move(stateMigrationRequest_.result);
  stateMigrationRequest_ = {};
  return result;
}

void ScriptHost::revokeModuleAuthorization() {
  std::lock_guard<std::mutex> guard(moduleLoadMutex_);
  advanceGraphEpoch(graphEpoch_);
  moduleLoaded_.store(false, std::memory_order_release);
  std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
  clearAuthorizationLocked();
}

bool ScriptHost::enqueueActions(const std::string& moduleId,
                                const std::vector<ScriptAction>& actions) {
  if (actions.empty() || actions.size() > kMaxQueuedActionsPerBatch) {
    commandsDropped_.fetch_add(actions.size(), std::memory_order_relaxed);
    return false;
  }

  QueuedActionBatch batch;
  batch.count = static_cast<std::uint16_t>(actions.size());
  {
    std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
    if (moduleId.empty() || moduleId != authorization_.moduleId) {
      commandsDropped_.fetch_add(actions.size(), std::memory_order_relaxed);
      return false;
    }
    for (const auto& action : actions) {
      if (!isActionAuthorizedLocked(action)) {
        commandsDropped_.fetch_add(actions.size(), std::memory_order_relaxed);
        return false;
      }
    }
    batch.authorizationGeneration = authorizationGeneration_;
  }
  for (std::size_t index = 0; index < actions.size(); ++index) {
    auto queuedAction = actions[index];
    if (queuedAction.type == ScriptActionType::audioCommand) {
      queuedAction.audioCommand.graphEpoch = graphEpoch_.load(std::memory_order_acquire);
    }
    batch.actions[index] = queuedAction;
  }

  {
    std::lock_guard<std::mutex> guard(queuedActionsMutex_);
    if (!running_.load(std::memory_order_acquire) || !queuedActions_.push(batch)) {
      commandsDropped_.fetch_add(actions.size(), std::memory_order_relaxed);
      return false;
    }
  }
  wakeSignal_.notify();
  return true;
}

void ScriptHost::run() {
  while (running_.load(std::memory_order_acquire)) {
    wakeSignal_.wait();
    if (!running_.load(std::memory_order_acquire)) {
      break;
    }

    wakeupCount_.fetch_add(1, std::memory_order_relaxed);
    processStateMigrationRequest();
    InputEvent inputEvent {};
    while (inputQueue_.pop(inputEvent)) {
      processedInputEvents_.fetch_add(1, std::memory_order_relaxed);
      processInputEvent(inputEvent);
      ++inputEventsSinceGarbageCollection_;
    }

    QueuedActionBatch batch;
    while (queuedActions_.pop(batch)) {
      for (std::uint16_t index = 0; index < batch.count; ++index) {
        processAction(batch.actions[index], batch.authorizationGeneration);
      }
    }
    if (inputEventsSinceGarbageCollection_ >= kInputEventsBetweenGarbageCollections) {
      std::lock_guard<std::mutex> moduleLoadGuard(moduleLoadMutex_);
      scriptEngine_.collectGarbage();
      inputEventsSinceGarbageCollection_ = 0;
    }
  }
}

void ScriptHost::processStateMigrationRequest() {
  StateMigrationRequest request;
  {
    std::lock_guard<std::mutex> guard(stateMigrationMutex_);
    if (!stateMigrationRequest_.pending) {
      return;
    }
    request.moduleId = stateMigrationRequest_.moduleId;
    request.stateJson = stateMigrationRequest_.stateJson;
    request.fromSchemaVersion = stateMigrationRequest_.fromSchemaVersion;
    request.toSchemaVersion = stateMigrationRequest_.toSchemaVersion;
    stateMigrationRequest_.pending = false;
    stateMigrationRequest_.inProgress = true;
  }

  bool authorized = false;
  {
    std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
    authorized = authorization_.moduleId == request.moduleId;
  }

  std::optional<std::string> result;
  if (authorized && moduleLoaded_.load(std::memory_order_acquire)) {
    std::lock_guard<std::mutex> moduleLoadGuard(moduleLoadMutex_);
    if (moduleLoaded_.load(std::memory_order_acquire)) {
      result = scriptEngine_.upgradeModuleState(
          request.stateJson, request.fromSchemaVersion, request.toSchemaVersion);
    }
  }

  {
    std::lock_guard<std::mutex> guard(stateMigrationMutex_);
    stateMigrationRequest_.inProgress = false;
    stateMigrationRequest_.completed = true;
    if (!stateMigrationRequest_.cancelled) {
      stateMigrationRequest_.result = std::move(result);
    }
  }
  stateMigrationCondition_.notify_all();
}

void ScriptHost::clearAuthorizationLocked() {
  releasePressedKeysLocked();
  authorization_ = {};
  deniedCapabilityLogMask_ = 0;
  ++authorizationGeneration_;
  if (authorizationGeneration_ == 0) {
    ++authorizationGeneration_;
  }
}

void ScriptHost::releasePressedKeysLocked() {
  std::size_t failedReleaseCount = 0;
  for (std::size_t keyCode = 0; keyCode < pressedKeys_.size(); ++keyCode) {
    if (!pressedKeys_[keyCode]) {
      continue;
    }
    if (keystrokeOutput_->sendKey(static_cast<std::uint16_t>(keyCode), false)) {
      pressedKeys_[keyCode] = false;
    } else {
      ++failedReleaseCount;
    }
  }
  if (failedReleaseCount > 0) {
    appendBackendLog("script-host",
                     "Failed to release pressed virtual keys count=" +
                         std::to_string(failedReleaseCount));
  }
}

bool ScriptHost::isActionAuthorizedLocked(const ScriptAction& action) {
  if (action.type == ScriptActionType::keystroke) {
    if (static_cast<std::size_t>(action.keyCode) >= pressedKeys_.size()) {
      appendBackendLog("script-host", "Rejected out-of-range virtual key code");
      return false;
    }
    if (!authorization_.allows(ScriptCapability::keyboardOutput)) {
      logUnauthorizedActionLocked(ScriptCapability::keyboardOutput, "keyboard-output");
      return false;
    }
    return true;
  }
  if (action.type == ScriptActionType::audioCommand) {
    if (!authorization_.allows(ScriptCapability::fxGraph)) {
      logUnauthorizedActionLocked(ScriptCapability::fxGraph, "fx-graph");
      return false;
    }
    return true;
  }
  return false;
}

void ScriptHost::logUnauthorizedActionLocked(ScriptCapability capability,
                                             const char* capabilityName) {
  const auto capabilityBit = static_cast<std::uint8_t>(capability);
  if ((deniedCapabilityLogMask_ & capabilityBit) != 0) {
    return;
  }
  deniedCapabilityLogMask_ |= capabilityBit;
  appendBackendLog(
      "script-host",
      "Rejected undeclared capability=" + std::string(capabilityName) +
          " module=" + (authorization_.moduleId.empty() ? std::string("<unauthenticated>")
                                                         : authorization_.moduleId));
}

void ScriptHost::processAction(const ScriptAction& action,
                               std::uint64_t authorizationGeneration) {
  std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
  if (authorizationGeneration == 0 || authorizationGeneration != authorizationGeneration_ ||
      !isActionAuthorizedLocked(action)) {
    commandsDropped_.fetch_add(1, std::memory_order_relaxed);
    return;
  }

  if (action.type == ScriptActionType::keystroke) {
    auto& isPressed = pressedKeys_[action.keyCode];
    if (isPressed == action.isKeyDown) {
      return;
    }
    if (keystrokeOutput_->sendKey(action.keyCode, action.isKeyDown)) {
      isPressed = action.isKeyDown;
    } else {
      commandsDropped_.fetch_add(1, std::memory_order_relaxed);
      appendBackendLog("script-host", "Failed to send virtual key state");
    }
    return;
  }

  if (action.type == ScriptActionType::audioCommand) {
    if (audioCommandQueue_.push(action.audioCommand)) {
      commandsPushed_.fetch_add(1, std::memory_order_relaxed);
    } else {
      commandsDropped_.fetch_add(1, std::memory_order_relaxed);
    }
  }
}

void ScriptHost::processInputEvent(const InputEvent& inputEvent) {
  if (inputEvent.type == InputEventType::controlStreamReset) {
    std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
    releasePressedKeysLocked();
    return;
  }
  if (inputEvent.graphEpoch != graphEpoch_.load(std::memory_order_acquire)) {
    return;
  }
  if (moduleLoaded_.load(std::memory_order_acquire)) {
    std::lock_guard<std::mutex> guard(moduleLoadMutex_);
    if (!moduleLoaded_.load(std::memory_order_acquire) ||
        inputEvent.graphEpoch != graphEpoch_.load(std::memory_order_acquire)) {
      return;
    }
    const auto action = scriptEngine_.dispatchInputEvent(inputEvent);
    if (action.has_value()) {
      if (inputEvent.graphEpoch != graphEpoch_.load(std::memory_order_acquire)) {
        return;
      }
      auto stampedAction = *action;
      if (stampedAction.type == ScriptActionType::audioCommand) {
        stampedAction.audioCommand.graphEpoch = inputEvent.graphEpoch;
      }
      std::uint64_t authorizationGeneration = 0;
      {
        std::lock_guard<std::mutex> authorizationGuard(authorizationMutex_);
        authorizationGeneration = authorizationGeneration_;
      }
      processAction(stampedAction, authorizationGeneration);
    }
  }
}

std::uint64_t ScriptHost::getWakeupCount() const noexcept {
  return wakeupCount_.load(std::memory_order_relaxed);
}

std::uint64_t ScriptHost::getProcessedInputEvents() const noexcept {
  return processedInputEvents_.load(std::memory_order_relaxed);
}

std::uint64_t ScriptHost::getCommandsPushed() const noexcept {
  return commandsPushed_.load(std::memory_order_relaxed);
}

std::uint64_t ScriptHost::getCommandsDropped() const noexcept {
  return commandsDropped_.load(std::memory_order_relaxed);
}

}  // namespace padpilot

