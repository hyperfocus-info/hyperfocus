#pragma once

#include <algorithm>
#include <atomic>

#include <juce_audio_basics/juce_audio_basics.h>

#include "runtime/lock-free-queue.h"
#include "runtime/runtime-types.h"

namespace padpilot {

class MidiOutputRuntime {
 public:
  static constexpr int kMaximumQueuedEventsPerBlock = 128;
  static constexpr int kPanicEventsPerBlock = 16;
  static constexpr std::size_t kMaximumMidiBufferBytesPerBlock =
      static_cast<std::size_t>(kMaximumQueuedEventsPerBlock + kPanicEventsPerBlock) *
      (3U + sizeof(std::int32_t) + sizeof(std::uint16_t));
  static_assert(kMaximumMidiBufferBytesPerBlock <= 2048U);

  bool enqueue(const MidiOutputCommand& command) noexcept {
    return commandQueue_.push(command);
  }

  void requestPanic() noexcept {
    panicRequested_.store(true, std::memory_order_release);
  }

  void reset() noexcept {
    commandQueue_.drain();
    panicRequested_.store(false, std::memory_order_release);
  }

  void processBlock(juce::MidiBuffer& midiMessages, int blockSamples = 1) noexcept {
    if (panicRequested_.exchange(false, std::memory_order_acq_rel)) {
      for (int channel = 1; channel <= 16; ++channel) {
        midiMessages.addEvent(juce::MidiMessage::allNotesOff(channel), 0);
      }
    }

    MidiOutputCommand command {};
    // PadPilot's JUCE wrappers reserve 2048 bytes before processing starts.
    // This fixed event cap plus the panic burst stays below that prepared boundary.
    for (int index = 0; index < kMaximumQueuedEventsPerBlock; ++index) {
      if (!commandQueue_.pop(command)) break;
      const auto channel = static_cast<int>(command.channel);
      const auto data1 = static_cast<int>(command.data1);
      const auto data2 = static_cast<int>(command.data2);
      const auto maximumSampleOffset = static_cast<std::uint32_t>(std::max(0, blockSamples - 1));
      const auto sampleOffset = static_cast<int>(std::min(command.sampleOffset, maximumSampleOffset));
      if (command.type == MidiOutputCommandType::noteOn) {
        midiMessages.addEvent(
            juce::MidiMessage::noteOn(channel, data1, static_cast<juce::uint8>(data2)), sampleOffset);
      } else if (command.type == MidiOutputCommandType::noteOff) {
        midiMessages.addEvent(
            juce::MidiMessage::noteOff(channel, data1, static_cast<juce::uint8>(data2)), sampleOffset);
      } else {
        midiMessages.addEvent(juce::MidiMessage::controllerEvent(channel, data1, data2), sampleOffset);
      }
    }
  }

 private:
  LockFreeQueue<MidiOutputCommand, 2048> commandQueue_;
  std::atomic<bool> panicRequested_ {false};
};

}  // namespace padpilot
