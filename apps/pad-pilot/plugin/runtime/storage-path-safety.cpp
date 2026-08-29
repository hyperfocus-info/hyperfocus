#include "runtime/storage-path-safety.h"

#include <cstdint>

#if JUCE_WINDOWS
#include <windows.h>
#endif

namespace padpilot::storage {

namespace {
bool treeIsFreeOfReparsePoints(const juce::File& path,
                               std::size_t& visitedEntries,
                               const std::size_t maximumEntries,
                               const std::uint32_t depth) {
  if (depth > 64U || isReparsePoint(path)) {
    return false;
  }
  if (!path.isDirectory()) {
    return true;
  }

  for (const auto& entry : juce::RangedDirectoryIterator(
           path, false, "*", juce::File::findFilesAndDirectories | juce::File::ignoreHiddenFiles)) {
    if (++visitedEntries > maximumEntries ||
        !treeIsFreeOfReparsePoints(entry.getFile(), visitedEntries, maximumEntries, depth + 1U)) {
      return false;
    }
  }
  for (const auto& entry : juce::RangedDirectoryIterator(
           path, false, "*", juce::File::findFilesAndDirectories)) {
    if (!entry.getFile().isHidden()) {
      continue;
    }
    if (++visitedEntries > maximumEntries ||
        !treeIsFreeOfReparsePoints(entry.getFile(), visitedEntries, maximumEntries, depth + 1U)) {
      return false;
    }
  }
  return true;
}
}  // namespace

std::string toPortableSerializedPath(std::string_view path) {
  std::string normalized(path);
  for (auto& character : normalized) {
    if (character == '\\') {
      character = '/';
    }
  }
  return normalized;
}

bool isReparsePoint(const juce::File& path) {
#if JUCE_WINDOWS
  const auto attributes = ::GetFileAttributesW(path.getFullPathName().toWideCharPointer());
  return attributes != INVALID_FILE_ATTRIBUTES &&
         (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
#else
  return path.isSymbolicLink();
#endif
}

bool isSameOrChildPath(const juce::File& path, const juce::File& boundary) {
  return path == boundary || path.isAChildOf(boundary);
}

bool hasReparsePointInPath(const juce::File& path) {
  auto current = path;
  for (;;) {
    if (isReparsePoint(current)) {
      return true;
    }
    const auto parent = current.getParentDirectory();
    if (parent == current) {
      return false;
    }
    current = parent;
  }
}

bool isSafeDirectory(const juce::File& directory, const juce::File& boundary) {
  return isSameOrChildPath(directory, boundary) && directory.isDirectory() &&
         !hasReparsePointInPath(directory);
}

bool ensureSafeDirectory(const juce::File& directory, const juce::File& boundary) {
  if (!isSameOrChildPath(directory, boundary) || hasReparsePointInPath(directory)) {
    return false;
  }
  if (directory.exists()) {
    return directory.isDirectory() && !hasReparsePointInPath(directory);
  }
  if (directory.createDirectory().failed()) {
    return false;
  }
  return isSafeDirectory(directory, boundary);
}

bool isSafeFile(const juce::File& file, const juce::File& boundary) {
  return isSameOrChildPath(file, boundary) && file.existsAsFile() &&
         !hasReparsePointInPath(file) && isSafeDirectory(file.getParentDirectory(), boundary);
}

bool isSafeFileTarget(const juce::File& file, const juce::File& boundary) {
  if (!isSameOrChildPath(file, boundary) || hasReparsePointInPath(file) ||
      !isSafeDirectory(file.getParentDirectory(), boundary)) {
    return false;
  }
  return !file.exists() || file.existsAsFile();
}

bool replaceFileAtomically(const juce::File& target,
                           const juce::File& boundary,
                           const void* data,
                           const std::size_t size) {
  if ((data == nullptr && size != 0U) || !isSafeFileTarget(target, boundary)) {
    return false;
  }

  juce::TemporaryFile temporary(target);
  auto output = temporary.getFile().createOutputStream();
  const std::uint8_t emptyByte = 0U;
  const auto* bytes = size == 0U ? &emptyByte : data;
  if (output == nullptr || !output->openedOk() || !output->write(bytes, size)) {
    return false;
  }
  output->flush();
  output.reset();
  if (!isSafeFile(temporary.getFile(), boundary) || !isSafeFileTarget(target, boundary)) {
    return false;
  }
  return temporary.overwriteTargetFileWithTemporary() && isSafeFile(target, boundary);
}

bool isSafeTree(const juce::File& path,
                const juce::File& boundary,
                const std::size_t maximumEntries) {
  if (!isSameOrChildPath(path, boundary) || hasReparsePointInPath(path) || !path.exists()) {
    return false;
  }
  std::size_t visitedEntries = 0;
  return treeIsFreeOfReparsePoints(path, visitedEntries, maximumEntries, 0U) &&
         !hasReparsePointInPath(path);
}

bool deleteSafePath(const juce::File& path,
                    const juce::File& boundary,
                    const std::size_t maximumEntries) {
  if (path == boundary || !isSameOrChildPath(path, boundary) || hasReparsePointInPath(path)) {
    return false;
  }
  if (!path.exists()) {
    return true;
  }

  if (!isSafeTree(path, boundary, maximumEntries)) {
    return false;
  }
  return path.isDirectory() ? path.deleteRecursively() : path.deleteFile();
}

}  // namespace padpilot::storage
