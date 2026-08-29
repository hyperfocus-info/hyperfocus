#pragma once

#include <juce_core/juce_core.h>

namespace padpilot::updater {

inline juce::String quoteWindowsArgument(const juce::String& argument) {
  if (argument.isNotEmpty() && !argument.containsAnyOf(" \t\n\v\"")) {
    return argument;
  }

  juce::String quoted = "\"";
  int backslashes = 0;
  for (int index = 0; index < argument.length(); index += 1) {
    const auto character = argument[index];
    if (character == '\\') {
      backslashes += 1;
      continue;
    }
    if (character == '"') {
      quoted += juce::String::repeatedString("\\", backslashes * 2 + 1) + "\"";
      backslashes = 0;
      continue;
    }
    quoted += juce::String::repeatedString("\\", backslashes);
    backslashes = 0;
    quoted += juce::String::charToString(character);
  }
  quoted += juce::String::repeatedString("\\", backslashes * 2) + "\"";
  return quoted;
}

}  // namespace padpilot::updater
