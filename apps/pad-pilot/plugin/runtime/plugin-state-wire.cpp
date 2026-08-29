#include "runtime/plugin-state-wire.h"

#include <array>
#include <cstdint>
#include <span>

#include "runtime/controller-config.h"
#include "runtime/managed-file-limits.h"
#include "runtime/state-wire-limits.h"

namespace padpilot {
namespace {
constexpr std::size_t kMaxPluginStateBytes = state_wire_limits::kMaximumPluginStateBytes;
constexpr std::size_t kMaxModuleStateBytes = state_wire_limits::kMaximumModuleStateBytes;
constexpr std::size_t kMaxEditorStateBytes = state_wire_limits::kMaximumEditorViewStateBytes;
constexpr std::size_t kMaxImportedMediaBytes = static_cast<std::size_t>(kMaximumManagedFileBytes);
constexpr std::size_t kMaxModules = state_wire_limits::kMaximumPersistedModules;
constexpr std::size_t kMaxPresets = state_wire_limits::kMaximumPersistedPresets;
constexpr std::size_t kMaxModuleStates = kMaxModules + 2U;
constexpr std::size_t kMaxAutomationBindings = state_wire_limits::kMaximumPersistedAutomationBindings;
constexpr std::size_t kMaxEditorStates = state_wire_limits::kMaximumPersistedEditorViewStates;
constexpr std::size_t kMaxImportedMedia = state_wire_limits::kMaximumPersistedImportedMedia;

class WireCursor {
 public:
  explicit WireCursor(std::span<const std::uint8_t> bytes)
      : current_(bytes.data()), end_(bytes.data() + bytes.size()) {}

  bool empty() const { return current_ == end_; }

  bool readVarint(std::uint64_t& value) {
    value = 0;
    for (int index = 0; index < 10; ++index) {
      if (current_ == end_) {
        return false;
      }
      const auto byte = *current_++;
      if (index == 9 && byte > 1U) {
        return false;
      }
      value |= static_cast<std::uint64_t>(byte & 0x7fU) << (index * 7);
      if ((byte & 0x80U) == 0U) {
        return true;
      }
    }
    return false;
  }

  bool readKey(std::uint32_t& fieldNumber, std::uint8_t& wireType) {
    std::uint64_t key = 0;
    if (!readVarint(key) || key > 0xffffffffULL) {
      return false;
    }
    fieldNumber = static_cast<std::uint32_t>(key >> 3U);
    wireType = static_cast<std::uint8_t>(key & 0x07U);
    return fieldNumber != 0U;
  }

  bool readBytes(std::span<const std::uint8_t>& bytes) {
    std::uint64_t length = 0;
    if (!readVarint(length) || length > static_cast<std::uint64_t>(end_ - current_)) {
      return false;
    }
    bytes = {current_, static_cast<std::size_t>(length)};
    current_ += static_cast<std::ptrdiff_t>(length);
    return true;
  }

  bool skipFixed(std::size_t size) {
    if (size > static_cast<std::size_t>(end_ - current_)) {
      return false;
    }
    current_ += static_cast<std::ptrdiff_t>(size);
    return true;
  }

 private:
  const std::uint8_t* current_;
  const std::uint8_t* end_;
};

bool addBounded(std::size_t value, std::size_t limit, std::size_t& aggregate) {
  if (aggregate > limit || value > limit - aggregate) {
    return false;
  }
  aggregate += value;
  return true;
}

bool readSingularVarint(WireCursor& cursor,
                        std::uint8_t wireType,
                        std::size_t& occurrences) {
  std::uint64_t ignored = 0;
  return wireType == 0U && occurrences++ == 0U && cursor.readVarint(ignored);
}

bool readSingularFixed(WireCursor& cursor,
                       std::uint8_t wireType,
                       std::uint8_t expectedWireType,
                       std::size_t& occurrences) {
  const auto byteCount = expectedWireType == 1U ? 8U : 4U;
  return wireType == expectedWireType && occurrences++ == 0U && cursor.skipFixed(byteCount);
}

bool readBoundedBytes(WireCursor& cursor,
                      std::uint8_t wireType,
                      std::size_t maxBytes,
                      std::span<const std::uint8_t>& bytes) {
  return wireType == 2U && cursor.readBytes(bytes) && bytes.size() <= maxBytes;
}

bool readSingularBytes(WireCursor& cursor,
                       std::uint8_t wireType,
                       std::size_t maxBytes,
                       std::size_t& occurrences,
                       std::span<const std::uint8_t>& bytes) {
  return occurrences++ == 0U && readBoundedBytes(cursor, wireType, maxBytes, bytes);
}

bool preflightModuleSummary(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 11> occurrences {};
  std::size_t capabilities = 0;
  std::size_t capabilityBytes = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) {
      return false;
    }
    switch (field) {
      case 1:
        if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
        break;
      case 2:
        if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
        break;
      case 3:
      case 5:
      case 9:
      case 10:
        if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
        break;
      case 4:
        if (++capabilities > 64U || !readBoundedBytes(cursor, wire, 64U, value) ||
            !addBounded(value.size(), 4096U, capabilityBytes)) return false;
        break;
      case 6:
      case 7:
        if (!readSingularBytes(cursor, wire, 32U * 1024U, occurrences[field], value)) return false;
        break;
      case 8:
        if (!readSingularBytes(cursor, wire, 4096U, occurrences[field], value)) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

bool preflightPreset(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 6> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    switch (field) {
      case 1:
      case 2:
        if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
        break;
      case 3:
        if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
        break;
      case 4:
        if (!readSingularBytes(cursor, wire, kMaxModuleStateBytes, occurrences[field], value)) return false;
        break;
      case 5:
        if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

bool preflightModuleState(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 4> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    switch (field) {
      case 1:
        if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
        break;
      case 2:
        if (!readSingularBytes(cursor, wire, kMaxModuleStateBytes, occurrences[field], value)) return false;
        break;
      case 3:
        if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

bool preflightAutomationBinding(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 12> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    switch (field) {
      case 1:
      case 3:
      case 4:
      case 7:
      case 8:
      case 9:
        if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
        break;
      case 2:
      case 5:
        if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
        break;
      case 6:
        if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
        break;
      case 10:
      case 11:
        if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

bool preflightEditorState(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 3> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    if (field == 1U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
    } else if (field == 2U) {
      if (!readSingularBytes(cursor, wire, kMaxEditorStateBytes, occurrences[field], value)) return false;
    } else {
      return false;
    }
  }
  return true;
}

bool preflightImportedMedia(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 7> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    std::size_t maxBytes = 0;
    switch (field) {
      case 1: maxBytes = 128U; break;
      case 2: maxBytes = 64U; break;
      case 3: maxBytes = 128U; break;
      case 4: maxBytes = 256U; break;
      case 5: maxBytes = 32U * 1024U; break;
      case 6: maxBytes = kMaxImportedMediaBytes; break;
      default: return false;
    }
    if (!readSingularBytes(cursor, wire, maxBytes, occurrences[field], value)) return false;
  }
  return true;
}

bool preflightControllerRow(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 6> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    if (field == 1U || field == 4U) {
      if (!readSingularBytes(
              cursor, wire, kMaximumControllerConfigIdBytes, occurrences[field], value)) return false;
    } else if (field == 2U) {
      if (!readSingularBytes(
              cursor, wire, kMaximumControllerHardwareIdBytes, occurrences[field], value)) return false;
    } else if (field == 3U || field == 5U) {
      if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
    } else {
      return false;
    }
  }
  return true;
}

bool preflightControllerButtonBinding(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 4> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    if (!cursor.readKey(field, wire)) return false;
    if (field == 1U || field == 2U) {
      if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
    } else if (field == 3U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else {
      return false;
    }
  }
  return true;
}

bool preflightControllerAxisBinding(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 3> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    if (!cursor.readKey(field, wire) || (field != 1U && field != 2U) ||
        !readSingularVarint(cursor, wire, occurrences[field])) return false;
  }
  return true;
}

bool preflightControllerLayout(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 5> occurrences {};
  std::size_t buttonBindings = 0;
  std::size_t axisBindings = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    if (field == 1U || field == 2U) {
      const auto limit = field == 1U ? kMaximumControllerConfigIdBytes
                                     : kMaximumControllerLayoutNameBytes;
      if (!readSingularBytes(cursor, wire, limit, occurrences[field], value)) return false;
    } else if (field == 3U) {
      if (++buttonBindings > 16U || !readBoundedBytes(cursor, wire, 64U, value) ||
          !preflightControllerButtonBinding(value)) return false;
    } else if (field == 4U) {
      if (++axisBindings > 4U || !readBoundedBytes(cursor, wire, 32U, value) ||
          !preflightControllerAxisBinding(value)) return false;
    } else {
      return false;
    }
  }
  return true;
}

bool preflightControllerConfig(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::size_t rows = 0;
  std::size_t layouts = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire)) return false;
    if (field == 1U) {
      if (++rows > kMaxControllerConfigRows || !readBoundedBytes(cursor, wire, 1024U, value) ||
          !preflightControllerRow(value)) return false;
    } else if (field == 2U) {
      if (++layouts > kMaxCustomControllerLayouts || !readBoundedBytes(cursor, wire, 4096U, value) ||
          !preflightControllerLayout(value)) return false;
    } else {
      return false;
    }
  }
  return true;
}

bool preflightSliceMarker(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 9> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    if (!cursor.readKey(field, wire) || field > 8U) return false;
    if (field == 4U || field == 7U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightPadAssignment(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 7> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 6U) return false;
    if (field == 3U) {
      if (!readSingularBytes(cursor, wire, 64U, occurrences[field], value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightChokeGroup(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 4> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 3U) return false;
    if (field == 2U) {
      if (!readSingularBytes(cursor, wire, 64U, occurrences[field], value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightRecutModuleState(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 29> occurrences {};
  std::array<std::size_t, 3> repeated {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 28U) return false;
    switch (field) {
      case 3:
        if (!readSingularBytes(cursor, wire, 32U * 1024U, occurrences[field], value)) return false;
        break;
      case 4:
      case 19:
        if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
        break;
      case 18:
        if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
        break;
      case 8:
      case 9:
      case 12:
      case 13:
      case 21:
      case 23:
      case 24:
      case 25:
      case 26:
      case 28:
        if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
        break;
      case 14:
        if (++repeated[0] > 16U || !readBoundedBytes(cursor, wire, 96U, value) ||
            !preflightSliceMarker(value)) return false;
        break;
      case 15:
        if (++repeated[1] > 16U || !readBoundedBytes(cursor, wire, 128U, value) ||
            !preflightPadAssignment(value)) return false;
        break;
      case 16:
        if (++repeated[2] > 16U || !readBoundedBytes(cursor, wire, 128U, value) ||
            !preflightChokeGroup(value)) return false;
        break;
      default:
        if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
        break;
    }
  }
  return true;
}

bool preflightAnalyzerScaleMatch(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 4> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 3U) return false;
    if (field == 1U) {
      if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
    } else if (field == 2U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
    } else if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightAnalyzerNoteEvent(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 10> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    if (!cursor.readKey(field, wire) || field > 9U) return false;
    if (field == 4U || field == 6U || field == 8U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightAnalyzerTakeSummary(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 7> occurrences {};
  std::size_t matches = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 6U) return false;
    if (field == 3U || field == 4U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field == 5U) {
      if (++matches > 3U || !readBoundedBytes(cursor, wire, 192U, value) ||
          !preflightAnalyzerScaleMatch(value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightAnalyzerModuleState(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 8> occurrences {};
  std::size_t events = 0;
  std::size_t eventBytes = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 7U) return false;
    if (field == 4U || field == 7U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field == 5U) {
      if (!readSingularBytes(cursor, wire, 1024U, occurrences[field], value) ||
          !preflightAnalyzerTakeSummary(value)) return false;
    } else if (field == 6U) {
      if (++events > 32'768U || !readBoundedBytes(cursor, wire, 64U, value) ||
          !addBounded(value.size(), kMaxModuleStateBytes, eventBytes) ||
          !preflightAnalyzerNoteEvent(value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightNodeParam(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 8> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 7U) return false;
    if (field == 1U) {
      if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
    } else if (field == 2U) {
      if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
    } else if (field == 7U) {
      if (!readSingularBytes(cursor, wire, 64U, occurrences[field], value)) return false;
    } else if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightEqBand(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 6> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 5U) return false;
    if (field <= 3U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field == 4U) {
      if (!readSingularBytes(cursor, wire, 64U, occurrences[field], value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightEqConfig(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 5> occurrences {};
  std::size_t bands = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 4U) return false;
    if (field <= 3U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (++bands > 30U || !readBoundedBytes(cursor, wire, 128U, value) ||
               !preflightEqBand(value)) {
      return false;
    }
  }
  return true;
}

bool preflightFxNode(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 27> occurrences {};
  std::size_t legacyParams = 0;
  std::size_t configs = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 26U) return false;
    if (field == 3U) {
      if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
    } else if (field == 10U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
    } else if (field == 6U) {
      if (++legacyParams > 32U || !readBoundedBytes(cursor, wire, 512U, value) ||
          !preflightNodeParam(value)) return false;
    } else if (field == 9U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field >= 11U) {
      if (++configs > 1U || occurrences[field]++ != 0U ||
          !readBoundedBytes(cursor, wire, 8192U, value) ||
          (field == 12U && !preflightEqConfig(value))) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightFxChain(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 8> occurrences {};
  std::size_t nodes = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 7U) return false;
    if (field == 2U) {
      if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
    } else if (field == 4U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field == 7U) {
      if (++nodes > 8U || !readBoundedBytes(cursor, wire, 64U * 1024U, value) ||
          !preflightFxNode(value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightFxMaster(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 5> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    if (!cursor.readKey(field, wire) || field == 0U || field > 4U ||
        !readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
  }
  return true;
}

bool preflightFxChainState(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 6> occurrences {};
  std::size_t chains = 0;
  std::size_t chainBytes = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 5U) return false;
    if (field == 1U || field == 2U) {
      if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
    } else if (field == 3U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
    } else if (field == 4U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value) ||
          !preflightFxMaster(value)) return false;
    } else if (++chains > 8U || !readBoundedBytes(cursor, wire, 512U * 1024U, value) ||
               !addBounded(value.size(), kMaxModuleStateBytes, chainBytes) ||
               !preflightFxChain(value)) {
      return false;
    }
  }
  return true;
}

bool preflightSampleSourceLoadRequest(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 4> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 3U) return false;
    const auto limit = field == 1U ? 32U * 1024U : field == 2U ? 256U : 128U;
    if (!readSingularBytes(cursor, wire, limit, occurrences[field], value)) return false;
  }
  return true;
}

bool preflightSampleAnalysisRequest(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 10> occurrences {};
  std::size_t markers = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 9U) return false;
    if (field == 4U || field == 5U || field == 6U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field == 7U) {
      if (++markers > 16U || !readBoundedBytes(cursor, wire, 96U, value) ||
          !preflightSliceMarker(value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightSlicePlaybackState(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 20> occurrences {};
  std::array<std::size_t, 3> repeated {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 19U) return false;
    if (field == 1U) {
      if (!readSingularBytes(cursor, wire, 512U, occurrences[field], value)) return false;
    } else if (field == 8U) {
      if (++repeated[0] > 16U || !readBoundedBytes(cursor, wire, 96U, value) ||
          !preflightSliceMarker(value)) return false;
    } else if (field == 9U) {
      if (++repeated[1] > 16U || !readBoundedBytes(cursor, wire, 128U, value) ||
          !preflightPadAssignment(value)) return false;
    } else if (field == 10U) {
      if (++repeated[2] > 16U || !readBoundedBytes(cursor, wire, 128U, value) ||
          !preflightChokeGroup(value)) return false;
    } else if (field == 2U || field == 3U || field == 6U || field == 7U ||
               field == 12U || field == 13U || field == 15U || field == 16U ||
               field == 17U || field == 19U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightSlicePlaybackTrigger(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 4> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    if (!cursor.readKey(field, wire) || field > 3U) return false;
    if (field == 2U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightSliceEditIntent(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 11> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 10U) return false;
    if (field == 3U || field == 9U || field == 10U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field == 5U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value) ||
          !preflightPadAssignment(value)) return false;
    } else if (field == 6U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value) ||
          !preflightChokeGroup(value)) return false;
    } else if (field == 7U) {
      if (!readSingularBytes(cursor, wire, 96U, occurrences[field], value) ||
          !preflightSliceMarker(value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightHapticIntent(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 5> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 4U) return false;
    if (field == 1U || field == 2U) {
      if (!readSingularFixed(cursor, wire, 5U, occurrences[field])) return false;
    } else if (field == 3U) {
      if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
    } else if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) {
      return false;
    }
  }
  return true;
}

bool preflightPresetSaveRequest(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 3> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 2U) return false;
    if (field == 1U) {
      if (!readSingularBytes(cursor, wire, 256U, occurrences[field], value)) return false;
    } else if (!readSingularBytes(cursor, wire, kMaxModuleStateBytes + 1024U,
                                  occurrences[field], value) ||
               !preflightPreset(value)) {
      return false;
    }
  }
  return true;
}

bool preflightSetModuleStateRequest(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::array<std::size_t, 4> occurrences {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 3U) return false;
    if (field == 1U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
    } else if (field == 2U) {
      if (!readSingularBytes(cursor, wire, kMaxModuleStateBytes, occurrences[field], value)) return false;
    } else if (!readSingularVarint(cursor, wire, occurrences[field])) {
      return false;
    }
  }
  return true;
}

bool preflightSetControllerConfigRequest(std::span<const std::uint8_t> bytes) {
  WireCursor cursor(bytes);
  std::size_t occurrences = 0;
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field != 1U ||
        !readSingularBytes(cursor,
                           wire,
                           state_wire_limits::kMaximumControllerConfigBytes,
                           occurrences,
                           value) ||
        !preflightControllerConfig(value)) return false;
  }
  return true;
}

std::span<const std::uint8_t> asWireBytes(std::string_view bytes) {
  return {reinterpret_cast<const std::uint8_t*>(bytes.data()), bytes.size()};
}
}  // namespace

bool preflightPluginStateWire(const void* data, std::size_t size) {
  if (data == nullptr || size == 0U || size > kMaxPluginStateBytes) {
    return false;
  }

  WireCursor cursor({static_cast<const std::uint8_t*>(data), size});
  std::array<std::size_t, 12> occurrences {};
  std::array<std::size_t, 12> aggregateBytes {};
  while (!cursor.empty()) {
    std::uint32_t field = 0;
    std::uint8_t wire = 0;
    std::span<const std::uint8_t> value;
    if (!cursor.readKey(field, wire) || field > 11U) {
      return false;
    }

    if (field == 1U) {
      if (!readSingularVarint(cursor, wire, occurrences[field])) return false;
      continue;
    }
    if (field == 5U || field == 6U) {
      if (!readSingularBytes(cursor, wire, 128U, occurrences[field], value)) return false;
      continue;
    }
    if (field == 11U) {
      constexpr auto kMaximumParameterBytes =
          state_wire_limits::kMaximumPersistedParameterValues * sizeof(float);
      if (!readSingularBytes(cursor, wire, kMaximumParameterBytes, occurrences[field], value) ||
          value.size() % sizeof(float) != 0U) {
        return false;
      }
      continue;
    }

    std::size_t maxOccurrences = 0;
    std::size_t maxEntryBytes = 0;
    std::size_t maxAggregateBytes = 0;
    switch (field) {
      case 2:
        maxOccurrences = kMaxModules;
        maxEntryBytes = 72U * 1024U;
        maxAggregateBytes = 16U * 1024U * 1024U;
        break;
      case 3:
        maxOccurrences = kMaxPresets;
        maxEntryBytes = kMaxModuleStateBytes + 1024U;
        maxAggregateBytes = state_wire_limits::kMaximumAggregatePresetStateBytes;
        break;
      case 4:
        maxOccurrences = kMaxModuleStates;
        maxEntryBytes = kMaxModuleStateBytes + 256U;
        maxAggregateBytes = state_wire_limits::kMaximumAggregateModuleStateBytes;
        break;
      case 7:
        maxOccurrences = kMaxAutomationBindings;
        maxEntryBytes = 2048U;
        maxAggregateBytes = 128U * 1024U;
        break;
      case 8:
        maxOccurrences = kMaxEditorStates;
        maxEntryBytes = kMaxEditorStateBytes + 256U;
        maxAggregateBytes =
            state_wire_limits::kMaximumAggregateEditorViewStateBytes + 64U * 1024U;
        break;
      case 9:
        maxOccurrences = kMaxImportedMedia;
        maxEntryBytes = kMaxImportedMediaBytes + 64U * 1024U;
        maxAggregateBytes = state_wire_limits::kMaximumAggregateImportedMediaBytes;
        break;
      case 10:
        maxOccurrences = 1U;
        maxEntryBytes = state_wire_limits::kMaximumControllerConfigBytes;
        maxAggregateBytes = maxEntryBytes;
        break;
      default:
        return false;
    }
    if (++occurrences[field] > maxOccurrences ||
        !readBoundedBytes(cursor, wire, maxEntryBytes, value) ||
        !addBounded(value.size(), maxAggregateBytes, aggregateBytes[field])) {
      return false;
    }

    const auto validNested = field == 2U ? preflightModuleSummary(value)
        : field == 3U ? preflightPreset(value)
        : field == 4U ? preflightModuleState(value)
        : field == 7U ? preflightAutomationBinding(value)
        : field == 8U ? preflightEditorState(value)
        : field == 9U ? preflightImportedMedia(value)
        : preflightControllerConfig(value);
    if (!validNested) {
      return false;
    }
  }
  return true;
}

bool preflightSetControllerConfigRequestWire(std::string_view bytes) {
  return bytes.size() <= state_wire_limits::kMaximumControllerConfigBytes &&
         preflightSetControllerConfigRequest(asWireBytes(bytes));
}

bool preflightFxChainStateWire(std::string_view bytes) {
  return bytes.size() <= kMaxModuleStateBytes && preflightFxChainState(asWireBytes(bytes));
}

bool preflightRecutModuleStateWire(std::string_view bytes) {
  return bytes.size() <= 128U * 1024U && preflightRecutModuleState(asWireBytes(bytes));
}

bool preflightAnalyzerModuleStateWire(std::string_view bytes) {
  return bytes.size() <= kMaxModuleStateBytes && preflightAnalyzerModuleState(asWireBytes(bytes));
}

bool preflightSampleSourceLoadRequestWire(std::string_view bytes) {
  return bytes.size() <= 40U * 1024U && preflightSampleSourceLoadRequest(asWireBytes(bytes));
}

bool preflightSampleAnalysisRequestWire(std::string_view bytes) {
  return bytes.size() <= 8U * 1024U && preflightSampleAnalysisRequest(asWireBytes(bytes));
}

bool preflightSlicePlaybackStateWire(std::string_view bytes) {
  return bytes.size() <= 16U * 1024U && preflightSlicePlaybackState(asWireBytes(bytes));
}

bool preflightSlicePlaybackTriggerWire(std::string_view bytes) {
  return bytes.size() <= 64U && preflightSlicePlaybackTrigger(asWireBytes(bytes));
}

bool preflightSliceEditIntentWire(std::string_view bytes) {
  return bytes.size() <= 4U * 1024U && preflightSliceEditIntent(asWireBytes(bytes));
}

bool preflightHapticIntentWire(std::string_view bytes) {
  return bytes.size() <= 512U && preflightHapticIntent(asWireBytes(bytes));
}

bool preflightPresetSaveRequestWire(std::string_view bytes) {
  return bytes.size() <= kMaxModuleStateBytes + 64U * 1024U &&
         preflightPresetSaveRequest(asWireBytes(bytes));
}

bool preflightSetModuleStateRequestWire(std::string_view bytes) {
  return bytes.size() <= kMaxModuleStateBytes + 64U * 1024U &&
         preflightSetModuleStateRequest(asWireBytes(bytes));
}

}  // namespace padpilot
