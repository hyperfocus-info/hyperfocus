#pragma once

#include <cstddef>
#include <cstdint>

namespace padpilot::module_manifest_limits {

inline constexpr std::size_t kMaximumVersionBytes = 128U;
inline constexpr std::size_t kMaximumApiVersionBytes = 128U;
inline constexpr std::uint32_t kMaximumStateSchemaVersion = 64U;
inline constexpr std::uint32_t kMaximumStateMigrationSteps = kMaximumStateSchemaVersion - 1U;

}  // namespace padpilot::module_manifest_limits
