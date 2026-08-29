#pragma once

#include <cstddef>
#include <string>
#include <string_view>

#include <juce_core/juce_core.h>

namespace padpilot::storage {

std::string toPortableSerializedPath(std::string_view path);
bool isReparsePoint(const juce::File& path);
bool isSameOrChildPath(const juce::File& path, const juce::File& boundary);
bool hasReparsePointInPath(const juce::File& path);
bool isSafeDirectory(const juce::File& directory, const juce::File& boundary);
bool ensureSafeDirectory(const juce::File& directory, const juce::File& boundary);
bool isSafeFile(const juce::File& file, const juce::File& boundary);
bool isSafeFileTarget(const juce::File& file, const juce::File& boundary);
bool replaceFileAtomically(const juce::File& target,
                           const juce::File& boundary,
                           const void* data,
                           std::size_t size);
bool isSafeTree(const juce::File& path,
                const juce::File& boundary,
                std::size_t maximumEntries = 8192U);
bool deleteSafePath(const juce::File& path,
                    const juce::File& boundary,
                    std::size_t maximumEntries = 8192U);

}  // namespace padpilot::storage
