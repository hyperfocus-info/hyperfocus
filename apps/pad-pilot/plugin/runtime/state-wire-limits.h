#pragma once

#include <cstddef>

namespace padpilot::state_wire_limits {

inline constexpr std::size_t kMaximumModuleStateBytes = 4U * 1024U * 1024U;
inline constexpr std::size_t kMaximumModuleStateBase64Chars =
    ((kMaximumModuleStateBytes + 2U) / 3U) * 4U;
inline constexpr std::size_t kMaximumPluginStateBytes = 96U * 1024U * 1024U;
inline constexpr std::size_t kMaximumEditorViewStateBytes = 256U * 1024U;
inline constexpr std::size_t kMaximumControllerConfigBytes = 256U * 1024U;
inline constexpr std::size_t kMaximumAggregateModuleStateBytes = 24U * 1024U * 1024U;
inline constexpr std::size_t kMaximumAggregatePresetStateBytes = 24U * 1024U * 1024U;
inline constexpr std::size_t kMaximumAggregateEditorViewStateBytes = 4U * 1024U * 1024U;
inline constexpr std::size_t kMaximumPersistedModules = 256U;
inline constexpr std::size_t kMaximumPersistedPresets = 4096U;
inline constexpr std::size_t kMaximumPersistedEditorViewStates = 256U;
inline constexpr std::size_t kMaximumPersistedImportedMedia = 4U;
inline constexpr std::size_t kMaximumPersistedAutomationBindings = 64U;
inline constexpr std::size_t kMaximumPersistedParameterValues = 19U;
inline constexpr std::size_t kMaximumAggregateImportedMediaBytes = 32U * 1024U * 1024U;

// HostSyncFrame includes bounded state plus navigation/input metadata. Per-entry
// allowances include protobuf tags and length prefixes in addition to field caps.
inline constexpr std::size_t kMaximumHostSyncModuleSummaryBytes = 12U * 1024U;
inline constexpr std::size_t kMaximumHostSyncPresetSummaryBytes = 512U;
inline constexpr std::size_t kMaximumHostSyncControllerConfigBytes = kMaximumControllerConfigBytes;
inline constexpr std::size_t kMaximumHostSyncInputDeviceBytes = 4U * 1024U;
inline constexpr std::size_t kMaximumHostSyncInputDevices = 8U;
inline constexpr std::size_t kMaximumHostSyncFixedWireBytes = 256U * 1024U;
inline constexpr std::size_t kMaximumLegalHostSyncFrameBytes =
    kMaximumModuleStateBytes + kMaximumAggregateEditorViewStateBytes +
    kMaximumHostSyncModuleSummaryBytes * kMaximumPersistedModules +
    kMaximumHostSyncPresetSummaryBytes * kMaximumPersistedPresets +
    kMaximumHostSyncControllerConfigBytes +
    kMaximumHostSyncInputDeviceBytes * kMaximumHostSyncInputDevices +
    kMaximumHostSyncFixedWireBytes;
inline constexpr std::size_t kMaximumHostSyncFrameBytes = 16U * 1024U * 1024U;
static_assert(kMaximumHostSyncFrameBytes >= kMaximumLegalHostSyncFrameBytes);

}  // namespace padpilot::state_wire_limits
