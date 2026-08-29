#pragma once

#include <string>
#include <vector>

namespace padpilot {

struct PresetRecord {
  std::string id;
  std::string moduleId;
  std::string name;
  std::string payloadJson;
};

class PresetStore {
 public:
  PresetStore();
  explicit PresetStore(std::string presetsRootPath);
  std::vector<PresetRecord> loadPresetsForModule(const std::string& moduleId) const;
  bool savePreset(const PresetRecord& preset) const;
  PresetRecord createDefaultPreset(const std::string& moduleId, const std::string& name) const;
  std::string getPresetsRootPath() const;

 private:
  std::string presetsRootPath_;
  bool storageRootReady_ {false};
};

}  // namespace padpilot
