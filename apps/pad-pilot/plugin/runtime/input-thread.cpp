#include "runtime/input-thread.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstring>
#include <limits>
#include <string>
#include <thread>

#include <SDL.h>

#include "runtime/backend-log.h"

namespace {

template <std::size_t N>
void copyCString(std::array<char, N>& destination, const char* source) {
  destination.fill('\0');
  if (source == nullptr) {
    return;
  }

  const auto sourceLength = std::strlen(source);
  const auto copyLength = std::min(sourceLength, N - 1);
  std::memcpy(destination.data(), source, copyLength);
  destination[copyLength] = '\0';
}

template <std::size_t N>
void copyCString(std::array<char, N>& destination, const std::string& source) {
  copyCString(destination, source.c_str());
}

std::string guidToString(SDL_JoystickGUID guid) {
  char guidBuffer[33] {};
  SDL_JoystickGetGUIDString(guid, guidBuffer, sizeof(guidBuffer));
  return guidBuffer;
}

float normalizeAxis(std::int16_t value) {
  const auto normalized = static_cast<float>(value) / 32767.0f;
  return std::clamp(normalized, -1.0f, 1.0f);
}

constexpr std::uint8_t kCanonicalButtonSouth = 0;
constexpr std::uint8_t kCanonicalButtonEast = 1;
constexpr std::uint8_t kCanonicalButtonWest = 2;
constexpr std::uint8_t kCanonicalButtonNorth = 3;
constexpr std::uint8_t kCanonicalButtonLb = 4;
constexpr std::uint8_t kCanonicalButtonRb = 5;
constexpr std::uint8_t kCanonicalButtonLt = 6;
constexpr std::uint8_t kCanonicalButtonRt = 7;
constexpr std::uint8_t kCanonicalButtonSelect = 8;
constexpr std::uint8_t kCanonicalButtonStart = 9;
constexpr std::uint8_t kCanonicalButtonL3 = 10;
constexpr std::uint8_t kCanonicalButtonR3 = 11;
constexpr std::uint8_t kCanonicalButtonDpadUp = 12;
constexpr std::uint8_t kCanonicalButtonDpadDown = 13;
constexpr std::uint8_t kCanonicalButtonDpadLeft = 14;
constexpr std::uint8_t kCanonicalButtonDpadRight = 15;

constexpr std::uint8_t kCanonicalAxisLeftX = 0;
constexpr std::uint8_t kCanonicalAxisLeftY = 1;
constexpr std::uint8_t kCanonicalAxisRightX = 2;
constexpr std::uint8_t kCanonicalAxisRightY = 3;

std::string buildHardwareId(SDL_GameController* controller) {
  auto* joystick = SDL_GameControllerGetJoystick(controller);
  if (joystick == nullptr) {
    return {};
  }

  std::uint16_t vendorId = 0;
  std::uint16_t productId = 0;
#if SDL_VERSION_ATLEAST(2, 0, 12)
  vendorId = SDL_GameControllerGetVendor(controller);
  productId = SDL_GameControllerGetProduct(controller);
#endif
  const char* serial = nullptr;
#if SDL_VERSION_ATLEAST(2, 0, 14)
  serial = SDL_GameControllerGetSerial(controller);
#endif
  const char* devicePath = nullptr;
#if SDL_VERSION_ATLEAST(2, 24, 0)
  devicePath = SDL_GameControllerPath(controller);
#endif
  return padpilot::makeControllerHardwareId(
      vendorId,
      productId,
      serial == nullptr ? std::string_view {} : std::string_view(serial),
      devicePath == nullptr ? std::string_view {} : std::string_view(devicePath),
      guidToString(SDL_JoystickGetGUID(joystick)));
}

std::string buildRuntimeDeviceId(SDL_GameController* controller, std::int32_t instanceId) {
  return buildHardwareId(controller) + "#" + std::to_string(instanceId);
}

padpilot::ControllerButtonBinding makeButtonBinding(std::uint8_t sourceIndex) {
  return {padpilot::ControllerBindingKind::button, sourceIndex, 0.5f};
}

padpilot::ControllerButtonBinding makeAxisPositiveBinding(std::uint8_t sourceIndex) {
  return {padpilot::ControllerBindingKind::axisPositive, sourceIndex, 0.15f};
}

padpilot::CustomControllerLayout createTemplateLayout() {
  padpilot::CustomControllerLayout layout;
  layout.buttonBindings[kCanonicalButtonSouth] = makeButtonBinding(SDL_CONTROLLER_BUTTON_A);
  layout.buttonBindings[kCanonicalButtonEast] = makeButtonBinding(SDL_CONTROLLER_BUTTON_B);
  layout.buttonBindings[kCanonicalButtonWest] = makeButtonBinding(SDL_CONTROLLER_BUTTON_X);
  layout.buttonBindings[kCanonicalButtonNorth] = makeButtonBinding(SDL_CONTROLLER_BUTTON_Y);
  layout.buttonBindings[kCanonicalButtonLb] = makeButtonBinding(SDL_CONTROLLER_BUTTON_LEFTSHOULDER);
  layout.buttonBindings[kCanonicalButtonRb] = makeButtonBinding(SDL_CONTROLLER_BUTTON_RIGHTSHOULDER);
  layout.buttonBindings[kCanonicalButtonLt] = makeAxisPositiveBinding(SDL_CONTROLLER_AXIS_TRIGGERLEFT);
  layout.buttonBindings[kCanonicalButtonRt] = makeAxisPositiveBinding(SDL_CONTROLLER_AXIS_TRIGGERRIGHT);
  layout.buttonBindings[kCanonicalButtonSelect] = makeButtonBinding(SDL_CONTROLLER_BUTTON_BACK);
  layout.buttonBindings[kCanonicalButtonStart] = makeButtonBinding(SDL_CONTROLLER_BUTTON_START);
  layout.buttonBindings[kCanonicalButtonL3] = makeButtonBinding(SDL_CONTROLLER_BUTTON_LEFTSTICK);
  layout.buttonBindings[kCanonicalButtonR3] = makeButtonBinding(SDL_CONTROLLER_BUTTON_RIGHTSTICK);
  layout.buttonBindings[kCanonicalButtonDpadUp] = makeButtonBinding(SDL_CONTROLLER_BUTTON_DPAD_UP);
  layout.buttonBindings[kCanonicalButtonDpadDown] = makeButtonBinding(SDL_CONTROLLER_BUTTON_DPAD_DOWN);
  layout.buttonBindings[kCanonicalButtonDpadLeft] = makeButtonBinding(SDL_CONTROLLER_BUTTON_DPAD_LEFT);
  layout.buttonBindings[kCanonicalButtonDpadRight] = makeButtonBinding(SDL_CONTROLLER_BUTTON_DPAD_RIGHT);

  layout.axisBindings[kCanonicalAxisLeftX] = {SDL_CONTROLLER_AXIS_LEFTX, false};
  layout.axisBindings[kCanonicalAxisLeftY] = {SDL_CONTROLLER_AXIS_LEFTY, false};
  layout.axisBindings[kCanonicalAxisRightX] = {SDL_CONTROLLER_AXIS_RIGHTX, false};
  layout.axisBindings[kCanonicalAxisRightY] = {SDL_CONTROLLER_AXIS_RIGHTY, false};
  return layout;
}

const padpilot::CustomControllerLayout& defaultTemplateLayout() {
  static const auto layout = createTemplateLayout();
  return layout;
}

padpilot::InputEventType mappedTypeForBinding(const padpilot::ControllerButtonBinding& binding) {
  return binding.bindingKind == padpilot::ControllerBindingKind::button
             ? padpilot::InputEventType::button
             : padpilot::InputEventType::axis;
}

}  // namespace

namespace padpilot {

InputThread::InputThread(LockFreeQueue<InputEvent, 2048>& eventQueue,
                         LockFreeQueue<HapticCommand, 256>& hapticQueue,
                         WakeSignal& inputSignal,
                         std::atomic<std::uint64_t>& graphEpoch)
    : eventQueue_(eventQueue),
      hapticQueue_(hapticQueue),
      inputSignal_(inputSignal),
      graphEpoch_(graphEpoch) {}

InputThread::~InputThread() {
  stop();
}

void InputThread::start() {
  std::lock_guard<std::mutex> lifecycleGuard(lifecycleMutex_);
  bool expected = false;
  if (!running_.compare_exchange_strong(expected, true)) {
    return;
  }

  if (!initializeSdl()) {
    running_.store(false, std::memory_order_release);
    return;
  }

  {
    std::lock_guard<std::mutex> guard(controllerStateMutex_);
    remapAllDevicesLocked();
  }

  enumerateConnectedControllers();
  thread_ = std::thread([this] { run(); });
}

void InputThread::stop() {
  std::lock_guard<std::mutex> lifecycleGuard(lifecycleMutex_);
  bool expected = true;
  if (!running_.compare_exchange_strong(expected, false)) {
    if (sdlInitialized_.load(std::memory_order_acquire)) {
      shutdownSdl();
    }
    return;
  }

  if (thread_.joinable()) {
    thread_.join();
  }

  std::lock_guard<std::mutex> publicationGuard(eventPublicationMutex_);
  std::uint64_t resetEpoch = 0;
  {
    std::lock_guard<std::mutex> guard(controllerStateMutex_);
    for (std::uint8_t slot = 0; slot < controllerHandles_.size(); ++slot) {
      closeDeviceSlot(slot);
    }
    controllerState_ = ControllerState {};
    resetEpoch = advanceGraphEpoch(graphEpoch_);
  }
  pushControlStreamReset(std::numeric_limits<std::uint8_t>::max(), resetEpoch);
  shutdownSdl();
}

void InputThread::setControllerConfig(const ControllerConfigState& controllerConfig) {
  std::lock_guard<std::mutex> publicationGuard(eventPublicationMutex_);
  std::uint64_t resetEpoch = 0;
  {
    std::lock_guard<std::mutex> guard(controllerStateMutex_);
    controllerConfig_ = controllerConfig;
    ensureControllerConfigHasRow(&controllerConfig_);
    ensureControllerConfigPrimaryRow(&controllerConfig_);
    remapAllDevicesLocked();
    resetEpoch = advanceGraphEpoch(graphEpoch_);
  }
  pushControlStreamReset(std::numeric_limits<std::uint8_t>::max(), resetEpoch);
}

bool InputThread::initializeSdl() {
  if (sdlInitialized_.load(std::memory_order_acquire)) {
    return true;
  }

  if (SDL_InitSubSystem(SDL_INIT_GAMECONTROLLER | SDL_INIT_HAPTIC | SDL_INIT_JOYSTICK | SDL_INIT_EVENTS) != 0) {
    appendBackendLog("input-thread", "SDL init failed: " + std::string(SDL_GetError()));
    return false;
  }
  SDL_GameControllerEventState(SDL_ENABLE);
  SDL_JoystickEventState(SDL_ENABLE);
  appendBackendLog("input-thread", "SDL controller subsystems initialized");
  sdlInitialized_.store(true, std::memory_order_release);
  return true;
}

void InputThread::shutdownSdl() {
  if (!sdlInitialized_.exchange(false, std::memory_order_acq_rel)) {
    return;
  }
  SDL_QuitSubSystem(SDL_INIT_GAMECONTROLLER | SDL_INIT_HAPTIC | SDL_INIT_JOYSTICK | SDL_INIT_EVENTS);
  appendBackendLog("input-thread", "SDL controller subsystems shut down");
}

void InputThread::enumerateConnectedControllers() {
  if (!sdlInitialized_.load(std::memory_order_acquire)) {
    return;
  }

  const auto joystickCount = SDL_NumJoysticks();
  for (int deviceIndex = 0; deviceIndex < joystickCount; ++deviceIndex) {
    handleControllerAdded(deviceIndex);
  }
}

void InputThread::run() {
  if (SDL_SetThreadPriority(SDL_THREAD_PRIORITY_HIGH) != 0) {
    appendBackendLog("input-thread", "Could not raise input worker priority: " + std::string(SDL_GetError()));
  } else {
    appendBackendLog("input-thread", "Input worker priority raised to high");
  }

  while (running_.load(std::memory_order_acquire)) {
    wakeupCount_.fetch_add(1, std::memory_order_relaxed);
    SDL_Event sdlEvent {};
    const int waitResult = SDL_WaitEventTimeout(&sdlEvent, 2);
    if (!running_.load(std::memory_order_acquire)) {
      break;
    }

    if (waitResult <= 0) {
      processHapticCommands();
      continue;
    }

    switch (sdlEvent.type) {
      case SDL_CONTROLLERDEVICEADDED:
        handleControllerAdded(sdlEvent.cdevice.which);
        break;
      case SDL_CONTROLLERDEVICEREMOVED:
        handleControllerRemoved(sdlEvent.cdevice.which);
        break;
      case SDL_CONTROLLERBUTTONDOWN:
      case SDL_CONTROLLERBUTTONUP:
        handleControllerButtonEvent(
            sdlEvent.cbutton.which,
            static_cast<std::uint8_t>(sdlEvent.cbutton.button),
            sdlEvent.cbutton.state == SDL_PRESSED);
        break;
      case SDL_CONTROLLERAXISMOTION:
        handleControllerAxisEvent(
            sdlEvent.caxis.which,
            static_cast<std::uint8_t>(sdlEvent.caxis.axis),
            sdlEvent.caxis.value);
        break;
      default:
        break;
    }

    while (SDL_PollEvent(&sdlEvent) != 0) {
      switch (sdlEvent.type) {
        case SDL_CONTROLLERDEVICEADDED:
          handleControllerAdded(sdlEvent.cdevice.which);
          break;
        case SDL_CONTROLLERDEVICEREMOVED:
          handleControllerRemoved(sdlEvent.cdevice.which);
          break;
        case SDL_CONTROLLERBUTTONDOWN:
        case SDL_CONTROLLERBUTTONUP:
          handleControllerButtonEvent(
              sdlEvent.cbutton.which,
              static_cast<std::uint8_t>(sdlEvent.cbutton.button),
              sdlEvent.cbutton.state == SDL_PRESSED);
          break;
        case SDL_CONTROLLERAXISMOTION:
          handleControllerAxisEvent(
              sdlEvent.caxis.which,
              static_cast<std::uint8_t>(sdlEvent.caxis.axis),
              sdlEvent.caxis.value);
          break;
        default:
          break;
      }
    }

    processHapticCommands();
  }
}

ControllerState InputThread::getControllerState() const {
  std::lock_guard<std::mutex> guard(controllerStateMutex_);
  return controllerState_;
}

InputDeviceStates InputThread::getInputDevices() const {
  std::lock_guard<std::mutex> guard(controllerStateMutex_);
  return inputDevices_;
}

std::uint64_t InputThread::getWakeupCount() const noexcept {
  return wakeupCount_.load(std::memory_order_relaxed);
}

std::uint64_t InputThread::getInputEventsPushed() const noexcept {
  return inputEventsPushed_.load(std::memory_order_relaxed);
}

std::uint64_t InputThread::getInputEventsDropped() const noexcept {
  return inputEventsDropped_.load(std::memory_order_relaxed);
}

std::uint64_t InputThread::getInputCommandsPushed() const noexcept {
  return inputCommandsPushed_.load(std::memory_order_relaxed);
}

std::uint64_t InputThread::getInputCommandsDropped() const noexcept {
  return inputCommandsDropped_.load(std::memory_order_relaxed);
}

void InputThread::handleControllerAdded(int deviceIndex) {
  if (!SDL_IsGameController(deviceIndex)) {
    return;
  }

  SDL_GameController* controller = SDL_GameControllerOpen(deviceIndex);
  if (controller == nullptr) {
    appendBackendLog("input-thread", "Failed to open SDL game controller index=" + std::to_string(deviceIndex) +
                                         " error=" + std::string(SDL_GetError()));
    return;
  }

  const auto instanceId = SDL_JoystickInstanceID(SDL_GameControllerGetJoystick(controller));
  std::lock_guard<std::mutex> publicationGuard(eventPublicationMutex_);
  std::uint8_t slot = static_cast<std::uint8_t>(controllerHandles_.size());
  std::uint64_t resetEpoch = 0;
  {
    std::lock_guard<std::mutex> guard(controllerStateMutex_);
    slot = findOrCreateDeviceSlot(instanceId);
    if (slot >= controllerHandles_.size()) {
      SDL_GameControllerClose(controller);
      appendBackendLog("input-thread", "Dropping controller; no free slot index=" + std::to_string(deviceIndex));
      return;
    }

    if (controllerHandles_[slot] != nullptr) {
      SDL_GameControllerClose(controllerHandles_[slot]);
    }
    controllerHandles_[slot] = controller;
    openDeviceSlot(slot, deviceIndex, instanceId);
    resetEpoch = advanceGraphEpoch(graphEpoch_);
  }
  pushControlStreamReset(slot, resetEpoch);
}

void InputThread::handleControllerRemoved(std::int32_t instanceId) {
  std::lock_guard<std::mutex> publicationGuard(eventPublicationMutex_);
  std::uint8_t removedSlot = static_cast<std::uint8_t>(controllerHandles_.size());
  std::uint64_t resetEpoch = 0;
  {
    std::lock_guard<std::mutex> guard(controllerStateMutex_);
    const auto slot = findDeviceSlot(instanceId);
    if (slot >= controllerHandles_.size()) {
      return;
    }

    appendBackendLog("input-thread", "Controller removed slot=" + std::to_string(slot) +
                                         " runtime-instance=" + std::to_string(instanceId));
    closeDeviceSlot(slot);
    updateControllerState();
    removedSlot = slot;
    resetEpoch = advanceGraphEpoch(graphEpoch_);
  }
  pushControlStreamReset(removedSlot, resetEpoch);
}

void InputThread::handleControllerButtonEvent(std::int32_t instanceId,
                                              std::uint8_t button,
                                              bool pressed) {
  std::lock_guard<std::mutex> publicationGuard(eventPublicationMutex_);
  InputEvent inputEvent {};
  inputEvent.deviceKind = InputDeviceKind::gamepad;
  inputEvent.type = InputEventType::button;
  inputEvent.controlId = button;
  inputEvent.value = pressed ? 1.0f : 0.0f;
  inputEvent.frameIndex = frameCounter_.fetch_add(1, std::memory_order_relaxed);

  {
    std::lock_guard<std::mutex> guard(controllerStateMutex_);
    const auto slot = findDeviceSlot(instanceId);
    if (slot >= inputDevices_.size()) {
      return;
    }

    inputEvent.deviceSlot = slot;
    auto& device = inputDevices_[slot];
    device.connected = true;
    device.frameIndex = inputEvent.frameIndex;
    if (button < device.rawButtons.size()) {
      device.rawButtons[button] = inputEvent.value;
    }
    remapDeviceLocked(device);
    for (std::uint16_t index = 0; index < kCanonicalGamepadButtons; ++index) {
      if (index >= device.buttons.size()) {
        break;
      }
      const auto* row = findControllerConfigRow(controllerConfig_, cStringView(device.hardwareId));
      const auto activeLayoutKind = row == nullptr ? ControllerLayoutKind::autoDetect : row->layoutKind;
      const auto* customLayout = row != nullptr && row->layoutKind == ControllerLayoutKind::customLayout
                                     ? findCustomControllerLayout(controllerConfig_, row->customLayoutId)
                                     : nullptr;
      const auto& layout = customLayout == nullptr ? defaultTemplateLayout() : *customLayout;
      const auto& binding = layout.buttonBindings[static_cast<std::size_t>(index)];
      if (binding.bindingKind == ControllerBindingKind::button && binding.sourceIndex == button) {
        inputEvent.mappedType = InputEventType::button;
        inputEvent.mappedControlId = index;
        inputEvent.mappedControlActive = true;
        inputEvent.value = device.buttons[index];
        device.activeLayoutKind = activeLayoutKind == ControllerLayoutKind::autoDetect
                                      ? device.detectedLayoutKind
                                      : activeLayoutKind;
        break;
      }
    }
    updateControllerState();
    inputEvent.graphEpoch = graphEpoch_.load(std::memory_order_acquire);
  }

  pushInputEvent(inputEvent);
}

void InputThread::handleControllerAxisEvent(std::int32_t instanceId,
                                            std::uint8_t axis,
                                            std::int16_t value) {
  std::lock_guard<std::mutex> publicationGuard(eventPublicationMutex_);
  InputEvent inputEvent {};
  inputEvent.deviceKind = InputDeviceKind::gamepad;
  inputEvent.type = InputEventType::axis;
  inputEvent.controlId = axis;

  {
    std::lock_guard<std::mutex> guard(controllerStateMutex_);
    const auto slot = findDeviceSlot(instanceId);
    if (slot >= inputDevices_.size() || axis >= kMaxControllerAxes) {
      return;
    }

    auto& calibration = axisCalibrations_[slot][axis];
    const auto normalizedValue = normalizeAxis(value);
    inputEvent.value = axis <= SDL_CONTROLLER_AXIS_RIGHTY
                           ? calibrateControllerAxis(calibration, normalizedValue)
                           : normalizedValue;
    if (!shouldPublishControllerAxis(calibration, inputEvent.value)) {
      return;
    }
    inputEvent.frameIndex = frameCounter_.fetch_add(1, std::memory_order_relaxed);
    inputEvent.deviceSlot = slot;
    auto& device = inputDevices_[slot];
    device.connected = true;
    device.frameIndex = inputEvent.frameIndex;
    if (axis < device.rawAxes.size()) {
      device.rawAxes[axis] = inputEvent.value;
    }
    remapDeviceLocked(device);
    for (std::uint16_t index = 0; index < kCanonicalGamepadAxes; ++index) {
      if (index >= device.axes.size()) {
        break;
      }
      const auto* row = findControllerConfigRow(controllerConfig_, cStringView(device.hardwareId));
      const auto activeLayoutKind = row == nullptr ? ControllerLayoutKind::autoDetect : row->layoutKind;
      const auto* customLayout = row != nullptr && row->layoutKind == ControllerLayoutKind::customLayout
                                     ? findCustomControllerLayout(controllerConfig_, row->customLayoutId)
                                     : nullptr;
      const auto& layout = customLayout == nullptr ? defaultTemplateLayout() : *customLayout;
      const auto& binding = layout.axisBindings[static_cast<std::size_t>(index)];
      if (binding.sourceIndex == axis) {
        inputEvent.mappedType = InputEventType::axis;
        inputEvent.mappedControlId = index;
        inputEvent.mappedControlActive = true;
        inputEvent.value = device.axes[index];
        device.activeLayoutKind = activeLayoutKind == ControllerLayoutKind::autoDetect
                                      ? device.detectedLayoutKind
                                      : activeLayoutKind;
        break;
      }
    }
    if (!inputEvent.mappedControlActive) {
      const auto* row = findControllerConfigRow(controllerConfig_, cStringView(device.hardwareId));
      const auto* customLayout = row != nullptr && row->layoutKind == ControllerLayoutKind::customLayout
                                     ? findCustomControllerLayout(controllerConfig_, row->customLayoutId)
                                     : nullptr;
      const auto& layout = customLayout == nullptr ? defaultTemplateLayout() : *customLayout;
      for (std::uint16_t index = 0; index < kCanonicalGamepadButtons; ++index) {
        const auto& binding = layout.buttonBindings[static_cast<std::size_t>(index)];
        if ((binding.bindingKind == ControllerBindingKind::axisPositive ||
             binding.bindingKind == ControllerBindingKind::axisNegative) &&
            binding.sourceIndex == axis) {
          inputEvent.mappedType = mappedTypeForBinding(binding);
          inputEvent.mappedControlId = index;
          inputEvent.mappedControlActive = true;
          inputEvent.value = device.buttons[index];
          break;
        }
      }
    }
    updateControllerState();
    inputEvent.graphEpoch = graphEpoch_.load(std::memory_order_acquire);
  }

  pushInputEvent(inputEvent);
}

std::uint8_t InputThread::findOrCreateDeviceSlot(std::int32_t instanceId) {
  const auto existing = findDeviceSlot(instanceId);
  if (existing < inputDevices_.size()) {
    return existing;
  }

  for (std::uint8_t slot = 0; slot < inputDevices_.size(); ++slot) {
    if (!inputDevices_[slot].connected && controllerHandles_[slot] == nullptr) {
      return slot;
    }
  }

  return static_cast<std::uint8_t>(inputDevices_.size());
}

std::uint8_t InputThread::findDeviceSlot(std::int32_t instanceId) const {
  for (std::uint8_t slot = 0; slot < inputDevices_.size(); ++slot) {
    if (inputDevices_[slot].runtimeInstanceId == instanceId) {
      return slot;
    }
  }

  return static_cast<std::uint8_t>(inputDevices_.size());
}

void InputThread::openDeviceSlot(std::uint8_t slot,
                                 int,
                                 std::int32_t instanceId) {
  if (slot >= inputDevices_.size()) {
    return;
  }

  auto& device = inputDevices_[slot];
  device = InputDeviceState {};
  axisCalibrations_[slot] = {};
  device.connected = true;
  device.kind = InputDeviceKind::gamepad;
  device.runtimeInstanceId = instanceId;
  if (controllerHandles_[slot] != nullptr) {
    const auto hardwareId = buildHardwareId(controllerHandles_[slot]);
    const auto runtimeDeviceId = buildRuntimeDeviceId(controllerHandles_[slot], instanceId);
    const auto* displayName = SDL_GameControllerName(controllerHandles_[slot]);
    copyCString(device.deviceId, hardwareId);
    copyCString(device.hardwareId, hardwareId);
    copyCString(device.runtimeDeviceId, runtimeDeviceId);
    copyCString(device.displayName, displayName);
    device.detectedLayoutKind = detectControllerLayout(
        displayName == nullptr ? std::string_view {} : std::string_view(displayName),
        hardwareId);
  }
  remapDeviceLocked(device);
  updateControllerState();
  appendBackendLog("input-thread", "Controller connected slot=" + std::to_string(slot) +
                                       " hardware-id=" + std::string(cStringView(device.hardwareId)) +
                                       " runtime-device-id=" + std::string(cStringView(device.runtimeDeviceId)));
}

void InputThread::closeDeviceSlot(std::uint8_t slot) {
  if (slot >= inputDevices_.size()) {
    return;
  }

  if (controllerHandles_[slot] != nullptr) {
    SDL_GameControllerClose(controllerHandles_[slot]);
    controllerHandles_[slot] = nullptr;
  }
  inputDevices_[slot] = InputDeviceState {};
  axisCalibrations_[slot] = {};
}

std::uint8_t InputThread::findPrimaryDeviceSlotLocked() {
  ensureControllerConfigHasRow(&controllerConfig_);
  ensureControllerConfigPrimaryRow(&controllerConfig_);
  const auto slot = findPrimaryControllerDeviceSlot(controllerConfig_, inputDevices_);
  return slot.has_value() ? static_cast<std::uint8_t>(*slot)
                          : static_cast<std::uint8_t>(inputDevices_.size());
}

void InputThread::remapAllDevicesLocked() {
  for (auto& device : inputDevices_) {
    if (!device.connected || device.kind != InputDeviceKind::gamepad) {
      continue;
    }
    remapDeviceLocked(device);
  }
  updateControllerState();
}

void InputThread::remapDeviceLocked(InputDeviceState& device) const {
  device.axes.fill(0.0f);
  device.buttons.fill(0.0f);

  const auto* row = findControllerConfigRow(controllerConfig_, cStringView(device.hardwareId));
  auto activeLayoutKind = row == nullptr ? ControllerLayoutKind::autoDetect : row->layoutKind;
  if (activeLayoutKind == ControllerLayoutKind::autoDetect) {
    activeLayoutKind = device.detectedLayoutKind == ControllerLayoutKind::autoDetect
                           ? ControllerLayoutKind::generic
                           : device.detectedLayoutKind;
  }
  device.activeLayoutKind = activeLayoutKind;

  const auto* customLayout = row != nullptr && row->layoutKind == ControllerLayoutKind::customLayout
                                 ? findCustomControllerLayout(controllerConfig_, row->customLayoutId)
                                 : nullptr;
  const auto& layout = customLayout == nullptr ? defaultTemplateLayout() : *customLayout;

  for (std::size_t index = 0; index < kCanonicalGamepadAxes; ++index) {
    const auto& binding = layout.axisBindings[index];
    if (binding.sourceIndex >= device.rawAxes.size() || index >= device.axes.size()) {
      continue;
    }
    const auto value = device.rawAxes[binding.sourceIndex];
    device.axes[index] = binding.inverted ? -value : value;
  }

  for (std::size_t index = 0; index < kCanonicalGamepadButtons; ++index) {
    if (index >= device.buttons.size()) {
      break;
    }
    device.buttons[index] = resolveControllerButtonValue(
        layout.buttonBindings[index], device.rawAxes, device.rawButtons);
  }
}

void InputThread::updateControllerState() {
  controllerState_ = ControllerState {};
  primaryDeviceSlot_.store(kPrimaryHapticDeviceSlot, std::memory_order_release);
  const auto primarySlot = findPrimaryDeviceSlotLocked();
  if (primarySlot >= inputDevices_.size()) {
    return;
  }

  const auto& device = inputDevices_[primarySlot];
  if (!device.connected || device.kind != InputDeviceKind::gamepad) {
    return;
  }

  controllerState_.connected = true;
  controllerState_.frameIndex = device.frameIndex;
  controllerState_.axes = device.axes;
  controllerState_.buttons = device.buttons;
  primaryDeviceSlot_.store(primarySlot, std::memory_order_release);
}

void InputThread::pushInputEvent(const InputEvent& inputEvent) {
  if (eventQueue_.push(inputEvent)) {
    inputEventsPushed_.fetch_add(1, std::memory_order_relaxed);
    inputSignal_.notify();
    return;
  }

  std::uint64_t droppedCount = 1;
  InputEvent discardedEvent {};
  while (eventQueue_.pop(discardedEvent)) {
    ++droppedCount;
  }
  inputEventsDropped_.fetch_add(droppedCount, std::memory_order_relaxed);

  InputEvent resetEvent {};
  resetEvent.deviceKind = inputEvent.deviceKind;
  resetEvent.deviceSlot = inputEvent.deviceSlot;
  resetEvent.type = InputEventType::controlStreamReset;
  resetEvent.frameIndex = frameCounter_.fetch_add(1, std::memory_order_relaxed);
  resetEvent.graphEpoch = advanceGraphEpoch(graphEpoch_);
  if (eventQueue_.push(resetEvent)) {
    inputEventsPushed_.fetch_add(1, std::memory_order_relaxed);
    inputSignal_.notify();
    appendBackendLog("input-thread",
                     "Input queue overflow; discarded pending controls and queued stream reset count=" +
                         std::to_string(droppedCount));
    return;
  }

  inputEventsDropped_.fetch_add(1, std::memory_order_relaxed);
  inputSignal_.notify();
  appendBackendLog("input-thread", "Input queue overflow recovery could not queue stream reset");
}

void InputThread::pushControlStreamReset(std::uint8_t deviceSlot, std::uint64_t graphEpoch) {
  InputEvent resetEvent {};
  resetEvent.deviceKind = InputDeviceKind::gamepad;
  resetEvent.deviceSlot = deviceSlot;
  resetEvent.type = InputEventType::controlStreamReset;
  resetEvent.frameIndex = frameCounter_.fetch_add(1, std::memory_order_relaxed);
  resetEvent.graphEpoch = graphEpoch;
  pushInputEvent(resetEvent);
}

void InputThread::processHapticCommands() {
  HapticCommand hapticCommand {};
  while (hapticQueue_.pop(hapticCommand)) {
    const auto deviceSlot = hapticCommand.deviceSlot == kPrimaryHapticDeviceSlot
                                ? primaryDeviceSlot_.load(std::memory_order_acquire)
                                : hapticCommand.deviceSlot;
    if (deviceSlot >= controllerHandles_.size() ||
        !std::isfinite(hapticCommand.lowFrequency) ||
        !std::isfinite(hapticCommand.highFrequency)) {
      continue;
    }

    auto* controller = controllerHandles_[deviceSlot];
    if (controller == nullptr) {
      continue;
    }

    const auto low = static_cast<Uint16>(std::clamp(hapticCommand.lowFrequency, 0.0f, 1.0f) * 65535.0f);
    const auto high = static_cast<Uint16>(std::clamp(hapticCommand.highFrequency, 0.0f, 1.0f) * 65535.0f);
    SDL_GameControllerRumble(controller, low, high, hapticCommand.durationMs);
  }
}

}  // namespace padpilot
