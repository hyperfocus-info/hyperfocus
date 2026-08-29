#pragma once

#include <string>

#include <juce_core/juce_core.h>

namespace padpilot::proto {

inline std::string bytesToBase64(const std::string& bytes) {
  return juce::Base64::toBase64(bytes.data(), bytes.size()).toStdString();
}

inline bool base64ToBytes(const std::string& base64, std::string* bytes) {
  if (bytes == nullptr) {
    return false;
  }

  juce::MemoryOutputStream output;
  if (!juce::Base64::convertFromBase64(output, juce::String(base64))) {
    return false;
  }

  bytes->assign(static_cast<const char*>(output.getData()), output.getDataSize());
  return true;
}

}  // namespace padpilot::proto
