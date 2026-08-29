#pragma once

#include <cmath>
#include <cstdint>
#include <optional>

#include <juce_core/juce_core.h>

namespace padpilot {

inline std::optional<double> readFiniteJsonNumber(const juce::var& value) {
  double number = 0.0;
  if (value.isInt()) {
    number = static_cast<double>(static_cast<int>(value));
  } else if (value.isInt64()) {
    number = static_cast<double>(static_cast<juce::int64>(value));
  } else if (value.isDouble()) {
    number = static_cast<double>(value);
  } else {
    return std::nullopt;
  }
  return std::isfinite(number) ? std::optional<double> {number} : std::nullopt;
}

inline std::optional<std::uint32_t> readBoundedJsonUInt(const juce::var& value,
                                                        std::uint32_t maxValue) {
  const auto number = readFiniteJsonNumber(value);
  if (!number.has_value() || *number < 0.0 || *number > static_cast<double>(maxValue) ||
      std::floor(*number) != *number) {
    return std::nullopt;
  }
  return static_cast<std::uint32_t>(*number);
}

inline std::optional<float> readBoundedJsonFloat(const juce::var& value,
                                                 float minValue,
                                                 float maxValue) {
  const auto number = readFiniteJsonNumber(value);
  if (!number.has_value() || *number < static_cast<double>(minValue) ||
      *number > static_cast<double>(maxValue)) {
    return std::nullopt;
  }
  return static_cast<float>(*number);
}

}  // namespace padpilot
