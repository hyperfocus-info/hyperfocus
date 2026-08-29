#pragma once

#include <algorithm>
#include <cmath>

namespace padpilot {

inline float finiteClamped(float value,
                           float minimum,
                           float maximum,
                           float fallback) noexcept {
  return std::isfinite(value) ? std::clamp(value, minimum, maximum) : fallback;
}

}  // namespace padpilot
