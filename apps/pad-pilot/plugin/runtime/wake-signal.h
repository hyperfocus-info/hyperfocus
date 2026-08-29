#pragma once

#include <atomic>

namespace padpilot {

class WakeSignal {
 public:
  void notify() noexcept {
    if (!pending_.exchange(true, std::memory_order_acq_rel)) {
      pending_.notify_one();
    }
  }

  void wait() noexcept {
    while (!pending_.exchange(false, std::memory_order_acq_rel)) {
      pending_.wait(false, std::memory_order_acquire);
    }
  }

 private:
  std::atomic<bool> pending_ {false};
};

}  // namespace padpilot
