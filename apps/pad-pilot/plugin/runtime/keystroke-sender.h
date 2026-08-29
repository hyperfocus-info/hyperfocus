#pragma once

#include <cstdint>

namespace padpilot {

class KeystrokeOutput {
 public:
  virtual ~KeystrokeOutput() = default;
  virtual bool sendKey(std::uint16_t virtualKeyCode, bool isKeyDown) const = 0;
};

class KeystrokeSender final : public KeystrokeOutput {
 public:
  bool sendKey(std::uint16_t virtualKeyCode, bool isKeyDown) const override;
};

}  // namespace padpilot
