#include "runtime/keystroke-sender.h"

#if defined(_WIN32)
#include <Windows.h>
#endif

namespace padpilot {

bool KeystrokeSender::sendKey(std::uint16_t virtualKeyCode, bool isKeyDown) const {
#if defined(_WIN32)
  INPUT input {};
  input.type = INPUT_KEYBOARD;
  input.ki.wVk = static_cast<WORD>(virtualKeyCode);
  input.ki.dwFlags = isKeyDown ? 0 : KEYEVENTF_KEYUP;
  return SendInput(1, &input, sizeof(INPUT)) == 1;
#else
  (void)virtualKeyCode;
  (void)isKeyDown;
  return false;
#endif
}

}  // namespace padpilot

