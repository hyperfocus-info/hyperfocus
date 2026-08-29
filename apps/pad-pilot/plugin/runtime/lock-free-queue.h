#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <type_traits>

namespace padpilot {

template <typename T, std::size_t Capacity>
class LockFreeQueue {
  static_assert(Capacity > 1, "Capacity must be greater than one.");
  static_assert((Capacity & (Capacity - 1)) == 0, "Capacity must be a power of two.");
  static_assert(std::is_trivially_copyable_v<T>, "Queue payload must be trivially copyable.");
  static_assert(std::atomic<std::size_t>::is_always_lock_free,
                "Queue positions must use lock-free atomics.");

 public:
  LockFreeQueue() noexcept {
    reset();
  }

  bool push(const T& item) noexcept {
    auto position = enqueuePosition_.load(std::memory_order_relaxed);
    Cell* cell = nullptr;
    for (;;) {
      cell = &buffer_[position & kIndexMask];
      const auto sequence = cell->sequence.load(std::memory_order_acquire);
      const auto difference = static_cast<std::intptr_t>(sequence) - static_cast<std::intptr_t>(position);
      if (difference == 0) {
        if (enqueuePosition_.compare_exchange_weak(
                position, position + 1, std::memory_order_relaxed, std::memory_order_relaxed)) {
          break;
        }
        continue;
      }
      if (difference < 0) {
        return false;
      }
      position = enqueuePosition_.load(std::memory_order_relaxed);
    }

    cell->value = item;
    cell->sequence.store(position + 1, std::memory_order_release);
    return true;
  }

  bool pop(T& out) noexcept {
    auto position = dequeuePosition_.load(std::memory_order_relaxed);
    Cell* cell = nullptr;
    for (;;) {
      cell = &buffer_[position & kIndexMask];
      const auto sequence = cell->sequence.load(std::memory_order_acquire);
      const auto difference =
          static_cast<std::intptr_t>(sequence) - static_cast<std::intptr_t>(position + 1);
      if (difference == 0) {
        if (dequeuePosition_.compare_exchange_weak(
                position, position + 1, std::memory_order_relaxed, std::memory_order_relaxed)) {
          break;
        }
        continue;
      }
      if (difference < 0) {
        return false;
      }
      position = dequeuePosition_.load(std::memory_order_relaxed);
    }

    out = cell->value;
    cell->sequence.store(position + Capacity, std::memory_order_release);
    return true;
  }

  void clear() noexcept {
    reset();
  }

  void drain() noexcept {
    T discarded {};
    while (pop(discarded)) {
    }
  }

 private:
  struct Cell {
    std::atomic<std::size_t> sequence {0};
    T value {};
  };

  void reset() noexcept {
    dequeuePosition_.store(0, std::memory_order_relaxed);
    enqueuePosition_.store(0, std::memory_order_relaxed);
    for (std::size_t index = 0; index < Capacity; ++index) {
      buffer_[index].sequence.store(index, std::memory_order_relaxed);
    }
  }

  static constexpr std::size_t kIndexMask = Capacity - 1;
  alignas(64) std::array<Cell, Capacity> buffer_ {};
  alignas(64) std::atomic<std::size_t> dequeuePosition_ {0};
  alignas(64) std::atomic<std::size_t> enqueuePosition_ {0};
};

}  // namespace padpilot
