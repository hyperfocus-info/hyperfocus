#pragma once

#include <atomic>
#include <array>
#include <mutex>
#include <thread>

#include <SDL.h>

#include "runtime/controller-config.h"
#include "runtime/lock-free-queue.h"
#include "runtime/runtime-types.h"
#include "runtime/wake-signal.h"

namespace padpilot {

class InputThread {
 public:
  InputThread(LockFreeQueue<InputEvent, 2048>& eventQueue,
              LockFreeQueue<HapticCommand, 256>& hapticQueue,
              WakeSignal& inputSignal,
              std::atomic<std::uint64_t>& graphEpoch);
  ~InputThread();

  void start();
  void stop();
  void setControllerConfig(const ControllerConfigState& controllerConfig);
  ControllerState getControllerState() const;
  InputDeviceStates getInputDevices() const;
  std::uint64_t getWakeupCount() const noexcept;
  std::uint64_t getInputEventsPushed() const noexcept;
  std::uint64_t getInputEventsDropped() const noexcept;
  std::uint64_t getInputCommandsPushed() const noexcept;
  std::uint64_t getInputCommandsDropped() const noexcept;

 private:
  void run();
  void handleControllerAdded(int deviceIndex);
  void handleControllerRemoved(std::int32_t instanceId);
  void handleControllerButtonEvent(std::int32_t instanceId,
                                   std::uint8_t button,
                                   bool pressed);
  void handleControllerAxisEvent(std::int32_t instanceId,
                                 std::uint8_t axis,
                                 std::int16_t value);
  bool initializeSdl();
  void shutdownSdl();
  void enumerateConnectedControllers();
  std::uint8_t findOrCreateDeviceSlot(std::int32_t instanceId);
  std::uint8_t findDeviceSlot(std::int32_t instanceId) const;
  void openDeviceSlot(std::uint8_t slot, int deviceIndex, std::int32_t instanceId);
  void closeDeviceSlot(std::uint8_t slot);
  std::uint8_t findPrimaryDeviceSlotLocked();
  void remapAllDevicesLocked();
  void remapDeviceLocked(InputDeviceState& device) const;
  void updateControllerState();
  void pushControlStreamReset(std::uint8_t deviceSlot, std::uint64_t graphEpoch);
  void pushInputEvent(const InputEvent& inputEvent);
  void processHapticCommands();

  LockFreeQueue<InputEvent, 2048>& eventQueue_;
  LockFreeQueue<HapticCommand, 256>& hapticQueue_;
  WakeSignal& inputSignal_;
  std::atomic<std::uint64_t>& graphEpoch_;
  mutable std::mutex controllerStateMutex_;
  ControllerConfigState controllerConfig_ {createDefaultControllerConfig()};
  ControllerState controllerState_ {};
  InputDeviceStates inputDevices_ {};
  std::array<::SDL_GameController*, kMaxInputDevices> controllerHandles_ {};
  std::array<std::array<ControllerAxisCalibration, kMaxControllerAxes>, kMaxInputDevices>
      axisCalibrations_ {};
  std::atomic<bool> running_ {false};
  std::atomic<bool> sdlInitialized_ {false};
  std::atomic<std::uint32_t> frameCounter_ {0};
  std::atomic<std::uint64_t> wakeupCount_ {0};
  std::atomic<std::uint64_t> inputEventsPushed_ {0};
  std::atomic<std::uint64_t> inputEventsDropped_ {0};
  std::atomic<std::uint64_t> inputCommandsPushed_ {0};
  std::atomic<std::uint64_t> inputCommandsDropped_ {0};
  std::atomic<std::uint32_t> primaryDeviceSlot_ {kPrimaryHapticDeviceSlot};
  std::mutex lifecycleMutex_;
  std::mutex eventPublicationMutex_;
  std::thread thread_;
};

}  // namespace padpilot

